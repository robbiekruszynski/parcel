import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRealtimeTracking } from '@/hooks/useRealtimeTracking';
import {
  buildPolygon,
  calculateArea,
  claimTerritory,
  isLoopClosed,
  routeDistanceMeters,
  type TerritoryPolygonJson,
} from '@/lib/territory';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useLocationStore } from '@/stores/locationStore';

type TerritoryRow = {
  id: string;
  user_id: string;
  polygon: TerritoryPolygonJson;
  area_m2: number;
  claimed_at: string;
};

/** Used only while waiting for first GPS fix (never shown as “your city”). */
const WORLD_FALLBACK: Region = {
  latitude: 20,
  longitude: 0,
  latitudeDelta: 55,
  longitudeDelta: 55,
};

const MAP_DELTA = { latitudeDelta: 0.008, longitudeDelta: 0.008 };

function ringToMapCoords(ring: [number, number][]) {
  const coords = ring.map(([lng, lat]) => ({
    latitude: lat,
    longitude: lng,
  }));
  if (coords.length > 1) {
    const a = coords[0];
    const b = coords[coords.length - 1];
    if (a.latitude === b.latitude && a.longitude === b.longitude) {
      coords.pop();
    }
  }
  return coords;
}

function markerColor(userId: string): string {
  let n = 0;
  for (let i = 0; i < userId.length; i++) n = (n + userId.charCodeAt(i) * 31) % 360;
  const colors = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fb923c', '#60a5fa'];
  return colors[n % colors.length];
}

function coordsToRegion(lat: number, lng: number): Region {
  return { latitude: lat, longitude: lng, ...MAP_DELTA };
}

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  const { startTracking, stopTracking, permissionIssue, clearPermissionIssue } = useRealtimeTracking();

  const position = useLocationStore((s) => s.position);
  const route = useLocationStore((s) => s.route);
  const otherPlayers = useLocationStore((s) => s.otherPlayers);
  const isTracking = useLocationStore((s) => s.isTracking);
  const setActiveTerritory = useLocationStore((s) => s.setActiveTerritory);

  const [territories, setTerritories] = useState<TerritoryRow[]>([]);
  const [loadingTerritories, setLoadingTerritories] = useState(true);
  const [claimBusy, setClaimBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  /** Map permission for browsing (separate from tracking hook messages). */
  const [mapPermission, setMapPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [gpsLocking, setGpsLocking] = useState(false);
  /** True once we have device coordinates (never rely on comparing Region objects). */
  const [hasRealFix, setHasRealFix] = useState(false);

  const loadTerritories = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setTerritories([]);
      setLoadingTerritories(false);
      return;
    }
    setLoadingTerritories(true);
    const { data, error } = await supabase
      .from('territories')
      .select('id, user_id, polygon, area_m2, claimed_at')
      .order('area_m2', { ascending: false });

    if (error) {
      if (__DEV__) console.warn('[map] territories fetch', error.message);
      setTerritories([]);
    } else {
      setTerritories((data ?? []) as TerritoryRow[]);
    }
    setLoadingTerritories(false);
  }, []);

  useEffect(() => {
    void loadTerritories();
    void supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });
  }, [loadTerritories]);

  /** Ask for location as soon as the map tab mounts; resolve GPS for camera. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setMapPermission('pending');
      setMapRegion(null);
      setGpsLocking(true);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;

      if (status !== Location.PermissionStatus.GRANTED) {
        setMapPermission('denied');
        setGpsLocking(false);
        return;
      }

      setMapPermission('granted');

      try {
        if (Platform.OS === 'android') {
          await Location.enableNetworkProviderAsync().catch(() => undefined);
        }

        let lat: number | undefined;
        let lng: number | undefined;

        try {
          const fix = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = fix.coords.latitude;
          lng = fix.coords.longitude;
        } catch {
          const last = await Location.getLastKnownPositionAsync();
          if (last) {
            lat = last.coords.latitude;
            lng = last.coords.longitude;
          }
        }

        if (cancelled) return;

        if (lat != null && lng != null) {
          const region = coordsToRegion(lat, lng);
          setHasRealFix(true);
          setMapRegion(region);
          useLocationStore.getState().setPosition({ lat, lng });
          requestAnimationFrame(() => {
            mapRef.current?.animateToRegion(region, 600);
          });
        } else {
          setHasRealFix(false);
          setMapRegion(WORLD_FALLBACK);
        }
      } finally {
        if (!cancelled) setGpsLocking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Passive updates while browsing (no Supabase writes). Stops during active tracking session. */
  useEffect(() => {
    if (mapPermission !== 'granted' || isTracking) return;

    let sub: Location.LocationSubscription | undefined;

    (async () => {
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 4000,
          distanceInterval: 12,
        },
        (loc) => {
          const lat = loc.coords.latitude;
          const lng = loc.coords.longitude;
          const region = coordsToRegion(lat, lng);
          setHasRealFix(true);
          setMapRegion(region);
          useLocationStore.getState().setPosition({ lat, lng });
          if (Platform.OS === 'android') {
            mapRef.current?.animateToRegion(region, 500);
          }
        }
      );
    })();

    return () => {
      sub?.remove();
    };
  }, [mapPermission, isTracking]);

  const loopClosed = useMemo(() => isLoopClosed(route), [route]);

  const routeKm = useMemo(
    () => (route.length > 1 ? routeDistanceMeters(route) / 1000 : 0),
    [route]
  );

  const areaPreviewM2 = useMemo(() => {
    if (!loopClosed || route.length < 4) return null;
    try {
      return calculateArea(buildPolygon(route));
    } catch {
      return null;
    }
  }, [loopClosed, route]);

  useEffect(() => {
    if (loopClosed && route.length > 0) {
      setActiveTerritory([...route]);
    } else {
      setActiveTerritory(null);
    }
  }, [loopClosed, route, setActiveTerritory]);

  useEffect(() => {
    if (!isTracking || !position || Platform.OS === 'ios') return;
    mapRef.current?.animateToRegion(coordsToRegion(position.lat, position.lng), 450);
  }, [position?.lat, position?.lng, isTracking]);

  const cameraRegion = useMemo(() => {
    if (isTracking && position) return coordsToRegion(position.lat, position.lng);
    return mapRegion;
  }, [isTracking, position?.lat, position?.lng, mapRegion]);

  const onClaim = async () => {
    if (!userId || !loopClosed) return;
    setClaimBusy(true);
    try {
      await claimTerritory(route, userId);
      useLocationStore.getState().resetRoute();
      await loadTerritories();
      Alert.alert('Territory claimed', 'Your loop was saved to Supabase.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not claim territory';
      Alert.alert('Claim failed', msg);
    } finally {
      setClaimBusy(false);
    }
  };

  const routeCoords = route.map((c) => ({
    latitude: c.lat,
    longitude: c.lng,
  }));

  const trackingPermissionMessage =
    permissionIssue === 'denied_foreground'
      ? 'Tracking needs location. Enable it in Settings, then tap Start again.'
      : permissionIssue === 'denied_auth'
        ? 'Sign in to broadcast your route and claim territory.'
        : permissionIssue === 'missing_supabase'
          ? 'Add Supabase URL + anon key to .env (see .env.example), then restart Expo.'
          : !isSupabaseConfigured
            ? 'Supabase is not configured — map works, but territories and live sync need .env.'
            : null;

  const retryMapPermission = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === Location.PermissionStatus.GRANTED) {
      setMapPermission('granted');
      setGpsLocking(true);
      try {
        const fix = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const region = coordsToRegion(fix.coords.latitude, fix.coords.longitude);
        setHasRealFix(true);
        setMapRegion(region);
        useLocationStore.getState().setPosition({
          lat: fix.coords.latitude,
          lng: fix.coords.longitude,
        });
        mapRef.current?.animateToRegion(region, 600);
      } catch {
        setHasRealFix(false);
        setMapRegion(WORLD_FALLBACK);
      } finally {
        setGpsLocking(false);
      }
    } else {
      setMapPermission('denied');
    }
  };

  if (mapPermission === 'pending') {
    return (
      <View className="flex-1 items-center justify-center bg-parcel-bg-dark px-8">
        <ActivityIndicator size="large" color="#f5c842" />
        <Text className="mt-6 text-center text-base text-white/80">Requesting location access…</Text>
        <Text className="mt-2 text-center text-sm text-white/45">
          parcel needs your location to show where you are on the map.
        </Text>
      </View>
    );
  }

  if (mapPermission === 'denied') {
    return (
      <View className="flex-1 items-center justify-center bg-parcel-bg-dark px-8">
        <Text className="text-center text-xl font-semibold text-white">Location off</Text>
        <Text className="mt-3 text-center text-base leading-6 text-white/55">
          Turn on location permission to see the live map and your position.
        </Text>
        <Pressable
          onPress={() => void retryMapPermission()}
          className="mt-8 w-full max-w-xs rounded-xl bg-parcel-gold py-4">
          <Text className="text-center text-base font-bold text-black">Try again</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openSettings()} className="mt-4 py-3">
          <Text className="text-center text-base text-parcel-gold underline">Open Settings</Text>
        </Pressable>
      </View>
    );
  }

  const initialRegion = cameraRegion ?? WORLD_FALLBACK;

  return (
    <View className="flex-1 bg-parcel-bg-dark">
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        style={{ flex: 1 }}
        showsUserLocation
        showsMyLocationButton={Platform.OS === 'android'}
        followsUserLocation={Platform.OS === 'ios'}
        initialRegion={initialRegion}>
        {routeCoords.length > 1 && (
          <Polyline
            coordinates={routeCoords}
            strokeColor="#22d3ee"
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {Object.entries(otherPlayers).map(([uid, coord]) => (
          <Marker
            key={uid}
            coordinate={{ latitude: coord.lat, longitude: coord.lng }}
            tracksViewChanges={false}>
            <View
              className="h-4 w-4 rounded-full border-2 border-white"
              style={{ backgroundColor: markerColor(uid) }}
            />
          </Marker>
        ))}

        {territories.map((t) => {
          const ring = t.polygon?.coordinates?.[0];
          if (!ring?.length) return null;
          return (
            <Polygon
              key={t.id}
              coordinates={ringToMapCoords(ring as [number, number][])}
              strokeColor="#f5c842"
              fillColor="rgba(245,200,66,0.22)"
              strokeWidth={2}
            />
          );
        })}
      </MapView>

      {gpsLocking && (
        <View className="absolute inset-0 items-center justify-center bg-black/40">
          <ActivityIndicator size="large" color="#f5c842" />
          <Text className="mt-4 text-sm font-medium text-white">Locking GPS…</Text>
        </View>
      )}

      {!gpsLocking && !hasRealFix && (
        <View className="absolute bottom-36 left-4 right-4 rounded-xl border border-amber-500/40 bg-black/80 px-4 py-3">
          <Text className="text-center text-sm text-amber-200">
            Couldn&apos;t read GPS yet. Move outdoors or check signal — still trying in the background.
          </Text>
        </View>
      )}

      <View className="absolute left-0 right-0 px-4" style={{ top: Math.max(insets.top, 12) + 8 }}>
        <View className="rounded-xl border border-white/10 bg-black/70 px-4 py-3 backdrop-blur-sm">
          {trackingPermissionMessage ? (
            <Text className="text-sm text-amber-400">{trackingPermissionMessage}</Text>
          ) : (
            <>
              <Text className="font-mono text-xs uppercase tracking-wide text-white/50">
                {isTracking ? 'Tracking · live' : 'Live map'}
              </Text>
              <Text className="mt-1 text-lg font-semibold text-white">
                Route · {routeKm.toFixed(2)} km · {route.length} pts
              </Text>
              {hasRealFix && cameraRegion && (
                <Text className="mt-1 font-mono text-xs text-emerald-400/90">
                  {position
                    ? `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`
                    : `${cameraRegion.latitude.toFixed(5)}, ${cameraRegion.longitude.toFixed(5)}`}
                </Text>
              )}
              {loopClosed && areaPreviewM2 != null && (
                <Text className="mt-1 text-sm text-parcel-gold">
                  Loop ready · {Math.round(areaPreviewM2)} m²
                </Text>
              )}
            </>
          )}
          {loadingTerritories && (
            <View className="mt-2 flex-row items-center gap-2">
              <ActivityIndicator color="#f5c842" size="small" />
              <Text className="text-xs text-white/40">Loading territories…</Text>
            </View>
          )}
        </View>
      </View>

      <View className="absolute left-4 right-4 gap-3" style={{ bottom: Math.max(insets.bottom, 16) + 8 }}>
        {loopClosed && (
          <Pressable
            disabled={claimBusy || !userId}
            onPress={() => void onClaim()}
            className="rounded-xl bg-parcel-gold py-4 disabled:opacity-40">
            <Text className="text-center text-base font-bold text-black">
              {claimBusy ? 'Claiming…' : 'Claim Territory'}
            </Text>
          </Pressable>
        )}

        <View className="flex-row gap-3">
          <Pressable
            onPress={() => {
              clearPermissionIssue();
              void startTracking();
            }}
            disabled={isTracking}
            className="flex-1 rounded-xl border border-emerald-400/50 bg-emerald-500/20 py-4 disabled:opacity-40">
            <Text className="text-center text-base font-semibold text-emerald-300">Start</Text>
          </Pressable>
          <Pressable
            onPress={() => void stopTracking()}
            disabled={!isTracking}
            className="flex-1 rounded-xl border border-red-400/50 bg-red-500/20 py-4 disabled:opacity-40">
            <Text className="text-center text-base font-semibold text-red-300">Stop</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

import { router } from 'expo-router';
import * as Location from 'expo-location';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, {
  MAP_TYPES,
  Marker,
  Polygon,
  Polyline,
  PROVIDER_GOOGLE,
  Region,
  UrlTile,
} from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CARTO_DARK_TILE_TEMPLATE, MAP_TILE_ATTRIBUTION } from '@/constants/mapTiles';
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

export type LiveParcelMapProps = {
  autoStartTracking?: boolean;
  activityLabel?: string | null;
};

type TerritoryRow = {
  id: string;
  user_id: string;
  polygon: TerritoryPolygonJson;
  area_m2: number;
  claimed_at: string;
};

const BG = '#0e0e10';
const CARD = '#16161a';
const AMBER = '#f5c518';
const CORAL = '#ff6b9d';

const WORLD_FALLBACK: Region = {
  latitude: 20,
  longitude: 0,
  latitudeDelta: 55,
  longitudeDelta: 55,
};

const MAP_DELTA = { latitudeDelta: 0.008, longitudeDelta: 0.008 };

function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return ((θ * 180) / Math.PI + 360) % 360;
}

function bearingToCardinal(brng: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const ix = Math.round(brng / 45) % 8;
  return dirs[ix];
}

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

/** Closed ring for dashed outline Polyline */
function closeLatLngRing(coords: { latitude: number; longitude: number }[]) {
  if (coords.length < 2) return coords;
  const a = coords[0];
  const b = coords[coords.length - 1];
  if (a.latitude === b.latitude && a.longitude === b.longitude) return coords;
  return [...coords, { ...a }];
}

function ParcelLogoMark() {
  return (
    <View style={{ width: 16, height: 16, justifyContent: 'center', alignItems: 'center' }}>
      <View
        style={{
          position: 'absolute',
          width: 14,
          height: 14,
          borderWidth: 1.5,
          borderColor: '#ffffff',
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: 18,
          height: 2,
          backgroundColor: '#ffffff',
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
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

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const FONT_DISPLAY = 'BarlowCondensed_900Black';
const FONT_LABEL = 'Rajdhani_600SemiBold';
const FONT_WORDMARK = 'Rajdhani_400Regular';

type ActivityTab = 'running' | 'walking' | 'cycling';

export function LiveParcelMap({ autoStartTracking = false, activityLabel }: LiveParcelMapProps) {
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  const autoStartedRef = useRef(false);
  const {
    startTracking,
    stopTracking,
    pauseTracking,
    resumeTracking,
    permissionIssue,
    clearPermissionIssue,
  } = useRealtimeTracking();

  const position = useLocationStore((s) => s.position);
  const route = useLocationStore((s) => s.route);
  const otherPlayers = useLocationStore((s) => s.otherPlayers);
  const isTracking = useLocationStore((s) => s.isTracking);
  const isPaused = useLocationStore((s) => s.isPaused);
  const setActiveTerritory = useLocationStore((s) => s.setActiveTerritory);

  const [territories, setTerritories] = useState<TerritoryRow[]>([]);
  const [loadingTerritories, setLoadingTerritories] = useState(true);
  const [claimBusy, setClaimBusy] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [mapPermission, setMapPermission] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [mapRegion, setMapRegion] = useState<Region | null>(null);
  const [gpsLocking, setGpsLocking] = useState(false);
  const [hasRealFix, setHasRealFix] = useState(false);
  const [gpsAccuracyM, setGpsAccuracyM] = useState<number | null>(null);
  const [showTerritoryLayer, setShowTerritoryLayer] = useState(true);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const prevSpeedSampleRef = useRef<{ c: { lat: number; lng: number }; t: number } | null>(null);

  const [activityTab, setActivityTab] = useState<ActivityTab>('running');

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
    if (isTracking || isPaused) return;
    const raw = activityLabel?.trim().toLowerCase() ?? '';
    if (raw.includes('walk')) setActivityTab('walking');
    else if (raw.includes('cycl') || raw.includes('bike')) setActivityTab('cycling');
    else if (raw.includes('run')) setActivityTab('running');
  }, [activityLabel, isTracking, isPaused]);

  useEffect(() => {
    void loadTerritories();
    void supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });
  }, [loadTerritories]);

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
          setGpsAccuracyM(fix.coords.accuracy ?? null);
        } catch {
          const last = await Location.getLastKnownPositionAsync();
          if (last) {
            lat = last.coords.latitude;
            lng = last.coords.longitude;
            setGpsAccuracyM(last.coords.accuracy ?? null);
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

  useEffect(() => {
    if (!autoStartTracking || mapPermission !== 'granted') return;
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    clearPermissionIssue();
    void startTracking();
  }, [autoStartTracking, mapPermission, clearPermissionIssue, startTracking]);

  useEffect(() => {
    if (mapPermission !== 'granted') return;
    if (isTracking && !isPaused) return;

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
          setGpsAccuracyM(loc.coords.accuracy ?? null);
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
  }, [mapPermission, isTracking, isPaused]);

  useEffect(() => {
    if (isTracking) {
      setSessionStartedAt((prev) => prev ?? Date.now());
    } else {
      setSessionStartedAt(null);
      setSpeedKmh(null);
      prevSpeedSampleRef.current = null;
    }
  }, [isTracking]);

  useEffect(() => {
    if (!isTracking || !sessionStartedAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isTracking, sessionStartedAt]);

  useEffect(() => {
    if (!position || !isTracking || isPaused) {
      return;
    }
    const now = Date.now();
    const prev = prevSpeedSampleRef.current;
    if (prev) {
      const dt = (now - prev.t) / 1000;
      if (dt >= 0.35 && dt < 90) {
        const dM = routeDistanceMeters([prev.c, position]);
        const kmh = (dM / dt) * 3.6;
        if (kmh >= 0 && kmh < 280) {
          setSpeedKmh((s) => (s == null ? kmh : s * 0.55 + kmh * 0.45));
        }
      }
    }
    prevSpeedSampleRef.current = { c: { lat: position.lat, lng: position.lng }, t: now };
  }, [position?.lat, position?.lng, isTracking, isPaused]);

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

  const elapsedMs = useMemo(() => {
    if (!isTracking || sessionStartedAt == null) return 0;
    return Date.now() - sessionStartedAt;
  }, [isTracking, sessionStartedAt, tick]);

  const mapCenter = useMemo(() => {
    if (position) return position;
    if (mapRegion) return { lat: mapRegion.latitude, lng: mapRegion.longitude };
    return { lat: 37.7749, lng: -122.4194 };
  }, [position, mapRegion]);

  const decorGoldCoords = useMemo(() => {
    const lat = mapCenter.lat;
    const lng = mapCenter.lng;
    const k = 0.0038;
    return [
      { latitude: lat + k * 0.15, longitude: lng - k * 1.25 },
      { latitude: lat + k * 1.45, longitude: lng - k * 1.05 },
      { latitude: lat + k * 1.55, longitude: lng + k * 0.85 },
      { latitude: lat + k * 0.35, longitude: lng + k * 1.15 },
      { latitude: lat - k * 0.95, longitude: lng + k * 0.95 },
      { latitude: lat - k * 1.05, longitude: lng - k * 0.35 },
    ];
  }, [mapCenter.lat, mapCenter.lng]);

  const decorPurpleCoords = useMemo(() => {
    const lat = mapCenter.lat - 0.0022;
    const lng = mapCenter.lng - 0.0035;
    const k = 0.0019;
    return [
      { latitude: lat, longitude: lng },
      { latitude: lat + k * 1.1, longitude: lng },
      { latitude: lat + k * 1.1, longitude: lng + k * 1.25 },
      { latitude: lat, longitude: lng + k * 1.25 },
    ];
  }, [mapCenter.lat, mapCenter.lng]);

  const decorGoldCentroid = useMemo(() => {
    let la = 0;
    let ln = 0;
    for (const c of decorGoldCoords) {
      la += c.latitude;
      ln += c.longitude;
    }
    const n = decorGoldCoords.length || 1;
    return { latitude: la / n, longitude: ln / n };
  }, [decorGoldCoords]);

  const decorPurpleCentroid = useMemo(() => {
    let la = 0;
    let ln = 0;
    for (const c of decorPurpleCoords) {
      la += c.latitude;
      ln += c.longitude;
    }
    const n = decorPurpleCoords.length || 1;
    return { latitude: la / n, longitude: ln / n };
  }, [decorPurpleCoords]);

  const rivalInfo = useMemo(() => {
    const entries = Object.entries(otherPlayers);
    if (!position || entries.length === 0) {
      return { handle: '@nightowl', sub: '312 M - SE' };
    }
    const [rid, coord] = entries[0];
    const dM = routeDistanceMeters([position, coord]);
    const brng = bearingDeg(position.lat, position.lng, coord.lat, coord.lng);
    const card = bearingToCardinal(brng);
    const distStr = dM >= 1000 ? `${(dM / 1000).toFixed(1)} KM` : `${Math.round(dM)} M`;
    const short = rid.replace(/-/g, '').slice(0, 6);
    return { handle: `@${short}`, sub: `${distStr} - ${card}` };
  }, [otherPlayers, position]);

  const paceStr = useMemo(() => {
    if (!isTracking || isPaused || speedKmh == null || speedKmh < 0.85) return '—';
    const minPerKm = 60 / speedKmh;
    const mm = Math.floor(minPerKm);
    const ss = Math.round((minPerKm - mm) * 60);
    return `${mm}:${String(ss).padStart(2, '0')}`;
  }, [isTracking, isPaused, speedKmh]);

  const distanceStr =
    route.length <= 1 || routeKm < 0.001 ? '—' : `${routeKm.toFixed(2)} km`;

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

  const setupBannerVisible = trackingPermissionMessage != null;

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
        setGpsAccuracyM(fix.coords.accuracy ?? null);
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

  const onPrimaryTransport = () => {
    if (!isTracking) {
      clearPermissionIssue();
      void startTracking();
      return;
    }
    if (isPaused) void resumeTracking();
    else pauseTracking();
  };

  const onLocate = () => {
    const r = cameraRegion ?? mapRegion;
    if (!r) return;
    const lat = isTracking && position ? position.lat : r.latitude;
    const lng = isTracking && position ? position.lng : r.longitude;
    mapRef.current?.animateToRegion(coordsToRegion(lat, lng), 450);
  };

  const labelTiny = {
    fontFamily: FONT_LABEL,
    fontSize: 10,
    letterSpacing: 1.8,
    color: 'rgba(255,255,255,0.38)',
    textTransform: 'uppercase' as const,
  };

  if (mapPermission === 'pending') {
    return (
      <View style={{ flex: 1, backgroundColor: BG }} className="items-center justify-center px-8">
        <ActivityIndicator size="large" color={AMBER} />
        <Text style={{ marginTop: 24, color: 'rgba(255,255,255,0.82)', fontSize: 16 }}>
          Requesting location access…
        </Text>
        <Text style={{ marginTop: 8, color: 'rgba(255,255,255,0.42)', fontSize: 14 }}>
          parcel needs your location to show where you are on the map.
        </Text>
      </View>
    );
  }

  if (mapPermission === 'denied') {
    return (
      <View style={{ flex: 1, backgroundColor: BG }} className="items-center justify-center px-8">
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '600' }}>Location off</Text>
        <Text style={{ marginTop: 12, color: 'rgba(255,255,255,0.52)', fontSize: 16, textAlign: 'center' }}>
          Turn on location permission to see the live map and your position.
        </Text>
        <Pressable
          onPress={() => void retryMapPermission()}
          style={{ marginTop: 28, backgroundColor: AMBER, paddingVertical: 16, paddingHorizontal: 48, borderRadius: 12 }}>
          <Text style={{ color: '#0e0e10', fontWeight: '700', fontSize: 16 }}>Try again</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openSettings()} style={{ marginTop: 14, padding: 12 }}>
          <Text style={{ color: AMBER, fontSize: 16, textDecorationLine: 'underline' }}>Open Settings</Text>
        </Pressable>
      </View>
    );
  }

  const initialRegion = cameraRegion ?? WORLD_FALLBACK;

  const bottomSafe = Math.max(insets.bottom, 14);
  const innerCardPadBottom = bottomSafe + 28;

  const readinessLabel = isPaused ? 'PAUSED' : isTracking ? 'ON THE MOVE' : 'READY TO RUN';

  const gpsLine =
    gpsAccuracyM != null
      ? `GPS • ${gpsAccuracyM >= 10 ? Math.round(gpsAccuracyM) : gpsAccuracyM.toFixed(1)}M`
      : 'GPS • —';

  const activityCopy =
    activityTab === 'running' ? 'Running' : activityTab === 'walking' ? 'Walking' : 'Cycling';

  const activityLocked = isTracking || isPaused;

  const activityTabs = (
    [
      { id: 'running' as const, icon: 'run' as const, label: 'Running' },
      { id: 'walking' as const, icon: 'walk' as const, label: 'Walking' },
      { id: 'cycling' as const, icon: 'bike' as const, label: 'Cycling' },
    ] as const
  );

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* Header + notifications above map (not over the map) */}
      <View style={{ paddingTop: Math.max(insets.top, 10), paddingHorizontal: 14, paddingBottom: 6 }}>
        <View style={{ position: 'relative', minHeight: 42, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <ParcelLogoMark />
              <Text style={{ fontFamily: FONT_WORDMARK, fontSize: 21, color: '#fff', letterSpacing: 0.4 }}>
                parcel
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open settings"
                onPress={() => router.push('/settings')}
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 21,
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.12)',
                  backgroundColor: 'rgba(12,12,14,0.92)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <FontAwesome name="cog" size={19} color="#fff" />
              </Pressable>
            </View>
          </View>
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: 'rgba(12,12,14,0.94)',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.09)',
              }}>
              <FontAwesome name="signal" size={11} color={AMBER} />
              <Text style={{ fontFamily: FONT_LABEL, fontSize: 12, color: 'rgba(255,255,255,0.42)' }}>
                {gpsLine}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {setupBannerVisible ? (
        <Pressable
          onPress={() =>
            Alert.alert('Finish setup', trackingPermissionMessage ?? 'Complete configuration to track live.')
          }
          style={{
            marginHorizontal: 12,
            marginBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 4,
            borderWidth: 1,
            borderColor: `${AMBER}55`,
            backgroundColor: 'rgba(245,197,24,0.08)',
          }}>
          <FontAwesome name="warning" size={16} color={AMBER} />
          <Text
            style={{
              flex: 1,
              fontFamily: FONT_LABEL,
              fontSize: 12,
              letterSpacing: 1.4,
              color: AMBER,
              fontWeight: '700',
            }}>
            ONE THING TO FINISH SETUP
          </Text>
          <FontAwesome name="chevron-down" size={13} color={AMBER} />
        </Pressable>
      ) : null}

      {!gpsLocking && !hasRealFix ? (
        <View
          style={{
            marginHorizontal: 12,
            marginBottom: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: 'rgba(251,191,120,0.35)',
            backgroundColor: 'rgba(251,191,120,0.06)',
            paddingVertical: 10,
            paddingHorizontal: 14,
          }}>
          <Text style={{ fontFamily: FONT_LABEL, fontSize: 13, color: 'rgba(251,231,200,0.92)', textAlign: 'center' }}>
            Looking for GPS… step outside or wait for a clearer fix.
          </Text>
        </View>
      ) : null}

      {loadingTerritories ? (
        <View
          style={{
            marginHorizontal: 12,
            marginBottom: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}>
          <ActivityIndicator color={AMBER} size="small" />
          <Text style={{ fontFamily: FONT_LABEL, fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>
            Syncing territories…
          </Text>
        </View>
      ) : null}

      {/* Upper ~55% map — inset rounded field */}
      <View style={{ flex: 11, backgroundColor: BG, paddingHorizontal: 12, paddingBottom: 6 }}>
        <View
          collapsable={false}
          style={{
            flex: 1,
            borderRadius: 22,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            backgroundColor: '#121214',
          }}>
          <MapView
            ref={mapRef}
            provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
            mapType={Platform.OS === 'android' ? MAP_TYPES.NONE : undefined}
            style={StyleSheet.absoluteFillObject}
            showsUserLocation={false}
            showsMyLocationButton={false}
            followsUserLocation={false}
            rotateEnabled
            pitchEnabled={false}
            cacheEnabled
            moveOnMarkerPress={false}
            initialRegion={initialRegion}>
          <UrlTile
            urlTemplate={CARTO_DARK_TILE_TEMPLATE}
            maximumZ={19}
            flipY={false}
            shouldReplaceMapContent={Platform.OS === 'ios'}
          />

          {showTerritoryLayer && (
            <>
              <Polygon
                coordinates={decorGoldCoords}
                strokeColor="rgba(245,197,24,0.15)"
                strokeWidth={1}
                fillColor="rgba(245,197,24,0.14)"
              />
              <Polyline
                coordinates={closeLatLngRing(decorGoldCoords)}
                strokeColor={AMBER}
                strokeWidth={2}
                lineDashPattern={[14, 10]}
                lineCap="round"
                lineJoin="round"
              />
              <Polygon
                coordinates={decorPurpleCoords}
                strokeColor="rgba(167,139,250,0.2)"
                strokeWidth={1}
                fillColor="rgba(167,139,250,0.12)"
              />
              <Polyline
                coordinates={closeLatLngRing(decorPurpleCoords)}
                strokeColor="#c4b5fd"
                strokeWidth={2}
                lineDashPattern={[14, 10]}
                lineCap="round"
                lineJoin="round"
              />
              <Marker coordinate={decorGoldCentroid} tracksViewChanges={false}>
                <View style={{ alignItems: 'center' }}>
                  <Text
                    style={{
                      color: 'rgba(245,197,24,0.72)',
                      fontSize: 10,
                      fontFamily: FONT_LABEL,
                      letterSpacing: 1,
                    }}>
                    you - 3d
                  </Text>
                </View>
              </Marker>
              <Marker coordinate={decorPurpleCentroid} tracksViewChanges={false}>
                <Text style={{ color: '#a5b4fc', fontSize: 10, fontFamily: FONT_LABEL }}>@kestrel</Text>
              </Marker>
            </>
          )}

          {showTerritoryLayer &&
            territories.map((t) => {
              const ring = t.polygon?.coordinates?.[0];
              if (!ring?.length) return null;
              return (
                <Polygon
                  key={t.id}
                  coordinates={ringToMapCoords(ring as [number, number][])}
                  strokeColor={`${AMBER}cc`}
                  fillColor={`${AMBER}18`}
                  strokeWidth={2}
                />
              );
            })}

          {routeCoords.length > 1 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor={AMBER}
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
            />
          )}

          {hasRealFix && position ? (
            <Marker coordinate={{ latitude: position.lat, longitude: position.lng }} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={{ alignItems: 'center', justifyContent: 'center', width: 44, height: 44 }}>
                <View
                  style={{
                    position: 'absolute',
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: `${AMBER}44`,
                    shadowColor: AMBER,
                    shadowOpacity: 1,
                    shadowRadius: 14,
                    shadowOffset: { width: 0, height: 0 },
                  }}
                />
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: '#ffffff',
                    borderWidth: 3,
                    borderColor: AMBER,
                    shadowColor: AMBER,
                    shadowOpacity: 0.9,
                    shadowRadius: 8,
                    elevation: 10,
                  }}
                />
              </View>
            </Marker>
          ) : null}

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
        </MapView>

        {/* Faint street labels */}
        <View pointerEvents="none" style={{ position: 'absolute', left: '10%', top: '28%' }}>
          <Text
            style={{
              color: 'rgba(255,255,255,0.11)',
              fontSize: 9,
              letterSpacing: 3,
              transform: [{ rotate: '-90deg' }],
              fontFamily: FONT_LABEL,
            }}>
            WARREN AVE
          </Text>
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', left: '42%', top: '38%' }}>
          <Text style={{ color: 'rgba(255,255,255,0.1)', fontSize: 9, letterSpacing: 2.5, fontFamily: FONT_LABEL }}>
            3RD AVE
          </Text>
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', right: '18%', top: '52%' }}>
          <Text
            style={{
              color: 'rgba(255,255,255,0.1)',
              fontSize: 9,
              letterSpacing: 3,
              transform: [{ rotate: '-90deg' }],
              fontFamily: FONT_LABEL,
            }}>
            5TH AVE
          </Text>
        </View>

        {/* Map float controls */}
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', right: 12, top: '38%', gap: 10 }}>
          <Pressable
            onPress={() => setShowTerritoryLayer((v) => !v)}
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: 'rgba(14,14,16,0.94)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.14)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <MaterialCommunityIcons name="layers-triple-outline" size={19} color={showTerritoryLayer ? AMBER : 'rgba(255,255,255,0.4)'} />
          </Pressable>
          <Pressable
            onPress={onLocate}
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: 'rgba(14,14,16,0.94)',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.14)',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#fff" />
          </Pressable>
        </View>

        {/* Activity selector — large amber pill for active, compact icons otherwise */}
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 14,
            alignItems: 'center',
          }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {activityTabs.map((tab) => {
              const active = activityTab === tab.id;
              const dimmed = activityLocked && !active;
              if (active) {
                return (
                  <Pressable
                    key={tab.id}
                    accessibilityState={{ disabled: activityLocked }}
                    disabled={activityLocked}
                    onPress={() => {
                      if (!activityLocked) setActivityTab(tab.id);
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 12,
                      paddingHorizontal: 22,
                      borderRadius: 999,
                      backgroundColor: AMBER,
                      opacity: activityLocked ? 0.95 : 1,
                      shadowColor: AMBER,
                      shadowOpacity: 0.35,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 4 },
                      elevation: 8,
                    }}>
                    <MaterialCommunityIcons name={tab.icon} size={22} color="#0e0e10" />
                    <Text
                      style={{
                        fontFamily: FONT_LABEL,
                        fontSize: 16,
                        fontWeight: '700',
                        color: '#0e0e10',
                        letterSpacing: 0.3,
                      }}>
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              }
              return (
                <Pressable
                  key={tab.id}
                  accessibilityState={{ disabled: activityLocked }}
                  disabled={activityLocked}
                  onPress={() => {
                    if (!activityLocked) setActivityTab(tab.id);
                  }}
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 23,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.18)',
                    backgroundColor: 'rgba(8,8,10,0.75)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: dimmed ? 0.35 : 1,
                  }}>
                  <MaterialCommunityIcons name={tab.icon} size={21} color="rgba(255,255,255,0.42)" />
                </Pressable>
              );
            })}
          </View>
        </View>

        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 12, bottom: 78, maxWidth: '82%' }}>
          <Text style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: FONT_WORDMARK }}>
            {MAP_TILE_ATTRIBUTION}
          </Text>
        </View>

        {gpsLocking && (
          <View
            style={{
              ...StyleSheet.absoluteFillObject,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.45)',
            }}>
            <ActivityIndicator size="large" color={AMBER} />
            <Text style={{ marginTop: 12, color: '#fff', fontFamily: FONT_LABEL }}>Locking GPS…</Text>
          </View>
        )}
        </View>
      </View>

      {/* Bottom card ~45% */}
      <View
        style={{
          flex: 9,
          backgroundColor: CARD,
          borderTopLeftRadius: 26,
          borderTopRightRadius: 26,
          paddingTop: 12,
          paddingHorizontal: 20,
          paddingBottom: innerCardPadBottom,
          borderTopWidth: 1,
          borderColor: 'rgba(255,255,255,0.06)',
          shadowColor: '#000',
          shadowOpacity: 0.45,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -12 },
          elevation: 24,
        }}>
        <View style={{ alignItems: 'center', marginBottom: 12 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)' }} />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...labelTiny }}>{readinessLabel}</Text>
            <Text
              style={{
                marginTop: 6,
                fontFamily: FONT_DISPLAY,
                fontSize: 34,
                lineHeight: 34,
                color: '#fff',
                letterSpacing: -0.5,
                textTransform: 'lowercase',
              }}>
              carve{'\n'}your line
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', maxWidth: '42%' }}>
            <Text style={{ ...labelTiny, letterSpacing: 1.4 }}>NEAREST RIVAL</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <Text style={{ fontFamily: FONT_LABEL, fontSize: 15, color: CORAL, fontWeight: '700' }}>
                {rivalInfo.handle}
              </Text>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: CORAL }} />
            </View>
            <Text style={{ marginTop: 4, fontFamily: FONT_LABEL, fontSize: 12, color: 'rgba(255,255,255,0.38)' }}>
              {rivalInfo.sub}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'stretch', marginTop: 22, paddingVertical: 8 }}>
          {(
            [
              { k: 'DISTANCE' as const, v: distanceStr },
              { k: 'PACE' as const, v: paceStr },
              {
                k: 'TIME' as const,
                v: isTracking && sessionStartedAt != null ? formatDuration(elapsedMs) : '0:00',
              },
              { k: 'POINTS' as const, v: `${route.length}` },
            ] as const
          ).map((col, idx) => (
            <View key={col.k} style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
              {idx > 0 ? (
                <View style={{ width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.08)', marginRight: 6 }} />
              ) : null}
              <View style={{ flex: 1 }}>
                <Text style={{ ...labelTiny, fontSize: 9, letterSpacing: 1.6 }}>{col.k}</Text>
                <Text
                  style={{
                    marginTop: 4,
                    fontFamily: FONT_LABEL,
                    fontSize: col.k === 'TIME' ? 22 : 19,
                    fontWeight: '700',
                    color: col.k === 'POINTS' ? AMBER : '#fff',
                  }}>
                  {col.v}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={{ marginTop: 10, minHeight: 110, justifyContent: 'flex-end' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <View>
              <Text style={{ ...labelTiny }}>TODAY&apos;S TARGET</Text>
              <Text style={{ marginTop: 8, fontFamily: FONT_LABEL, fontSize: 22, fontWeight: '700', color: AMBER }}>
                3.0 KM
              </Text>
              <Text style={{ marginTop: 4, fontFamily: FONT_LABEL, fontSize: 22, fontWeight: '700', color: AMBER }}>
                0.4 KM²
              </Text>
              <Pressable
                onPress={() => {
                  if (loopClosed && userId) void onClaim();
                  else if (!loopClosed) Alert.alert('Claim', 'Close a loop on the map to claim territory.');
                  else Alert.alert('Claim', 'Sign in to claim.');
                }}
                disabled={claimBusy}
                style={{ marginTop: 6 }}>
                <Text style={{ fontFamily: FONT_LABEL, fontSize: 11, letterSpacing: 2, color: AMBER }}>
                  {claimBusy ? 'CLAIMING…' : 'CLAIM'}
                </Text>
              </Pressable>
            </View>

            <View style={{ alignItems: 'flex-end', paddingBottom: 6 }}>
              <Text style={{ ...labelTiny }}>SESSION</Text>
              <Text style={{ marginTop: 10, fontFamily: FONT_LABEL, fontSize: 14, color: AMBER, fontWeight: '600' }}>
                {!isTracking ? 'tap to begin' : isPaused ? 'tap to resume' : 'tap to pause'}
              </Text>
              <Text style={{ marginTop: 6, fontFamily: FONT_LABEL, fontSize: 11, color: 'rgba(255,255,255,0.28)' }}>
                {activityCopy}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              !isTracking ? 'Start tracking' : isPaused ? 'Resume tracking' : 'Pause tracking'
            }
            onPress={onPrimaryTransport}
            disabled={!!trackingPermissionMessage && !isTracking}
            style={{
              position: 'absolute',
              left: '50%',
              marginLeft: -32,
              bottom: 4,
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: AMBER,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: trackingPermissionMessage && !isTracking ? 0.35 : 1,
              shadowColor: AMBER,
              shadowOpacity: 0.72,
              shadowRadius: 22,
              shadowOffset: { width: 0, height: 6 },
              elevation: 14,
            }}>
            <FontAwesome
              name={!isTracking ? 'play' : isPaused ? 'play' : 'pause'}
              size={26}
              color="#0e0e10"
              style={{ marginLeft: !isTracking || isPaused ? 3 : 0 }}
            />
          </Pressable>
        </View>

        {isTracking ? (
          <Pressable
            onPress={() => void stopTracking()}
            style={{ alignSelf: 'center', marginTop: 14, paddingVertical: 8, paddingHorizontal: 20 }}>
            <Text style={{ fontFamily: FONT_LABEL, fontSize: 12, letterSpacing: 2, color: '#f87171' }}>STOP</Text>
          </Pressable>
        ) : null}

        {loopClosed && areaPreviewM2 != null ? (
          <Text style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: `${AMBER}bb` }}>
            Loop · {Math.round(areaPreviewM2)} m² — tap CLAIM
          </Text>
        ) : null}
      </View>
    </View>
  );
}

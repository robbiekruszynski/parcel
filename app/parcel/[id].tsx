/**
 * app/parcel/[id].tsx
 *
 * Full-screen parcel detail view:
 *  - Mapbox map centred on the parcel with the route polygon drawn
 *  - Info sheet at bottom: owner, activity, claimed date/time, area, distance, points
 *  - Accessible from Territory expanded cards and from the map ParcelDetailSheet
 */

import MapboxGL from '@rnmapbox/maps';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { formatAreaM2, formatDistanceM } from '@/lib/parcelGeometry';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParcelDetail {
  id: string;
  owner_id: string;
  coordinates: [number, number][];
  route_coordinates: [number, number][] | null;
  area_sqm: number;
  claimed_at: string;
  color: string;
  points: number;
  activity: string;
  owner_username: string | null;
  owner_display_name: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function routeDistance(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1], coords[i]);
  return d;
}

type ActivityIconName = 'walk' | 'run' | 'bike' | 'rollerblade' | 'map-marker-path';

function activityIcon(activity: string): ActivityIconName {
  switch (activity) {
    case 'walking':       return 'walk';
    case 'running':       return 'run';
    case 'cycling':       return 'bike';
    case 'rollerblading': return 'rollerblade';
    default:              return 'map-marker-path';
  }
}

function activityLabel(activity: string): string {
  switch (activity) {
    case 'walking':       return 'Walk';
    case 'running':       return 'Run';
    case 'cycling':       return 'Cycle';
    case 'rollerblading': return 'Rollerblade';
    default:              return activity;
  }
}

function initials(name: string | null): string {
  if (!name?.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return parts[0].slice(0, 2).toUpperCase();
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ParcelDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<MapboxGL.Camera>(null);

  const [parcel, setParcel] = useState<ParcelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch parcel
  useEffect(() => {
    if (!id) return;
    void (async () => {
      const { data, error: err } = await supabase
        .from('parcels')
        .select(`
          id, owner_id, coordinates, route_coordinates, area_sqm, claimed_at,
          color, points, activity,
          profiles ( username, display_name )
        `)
        .eq('id', id)
        .single();

      if (err || !data) {
        setError(err?.message ?? 'Parcel not found');
      } else {
        const row = data as unknown as {
          id: string; owner_id: string;
          coordinates: [number, number][] | null;
          route_coordinates: [number, number][] | null;
          area_sqm: number | null; claimed_at: string;
          color: string | null; points: number | null;
          activity: string | null;
          profiles: { username: string | null; display_name: string | null } | null;
        };
        setParcel({
          id: row.id,
          owner_id: row.owner_id,
          coordinates: row.coordinates ?? [],
          route_coordinates: row.route_coordinates ?? null,
          area_sqm: row.area_sqm ?? 0,
          claimed_at: row.claimed_at,
          color: row.color ?? '#f5c518',
          points: row.points ?? 0,
          activity: row.activity ?? 'walking',
          owner_username: row.profiles?.username ?? null,
          owner_display_name: row.profiles?.display_name ?? null,
        });
      }
      setLoading(false);
    })();
  }, [id]);

  // Fit camera once parcel loads
  useEffect(() => {
    if (!parcel || parcel.coordinates.length < 2) return;
    const lats = parcel.coordinates.map((c) => c[0]);
    const lngs = parcel.coordinates.map((c) => c[1]);
    const ne: [number, number] = [Math.max(...lngs), Math.max(...lats)];
    const sw: [number, number] = [Math.min(...lngs), Math.min(...lats)];
    // Small delay to ensure the map is mounted
    const t = setTimeout(() => {
      cameraRef.current?.fitBounds(ne, sw, [120, 40, 280, 40], 600);
    }, 300);
    return () => clearTimeout(t);
  }, [parcel]);

  // Build GeoJSON for the parcel polygon
  const parcelGeoJson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!parcel || parcel.coordinates.length < 3) return null;
    const ring: [number, number][] = parcel.coordinates.map(([lat, lng]) => [lng, lat]);
    ring.push([parcel.coordinates[0][1], parcel.coordinates[0][0]]);
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: parcel.id,
          geometry: { type: 'Polygon', coordinates: [ring] },
          properties: { color: parcel.color },
        },
      ],
    };
  }, [parcel]);

  // Build GeoJSON for the route line
  const routeGeoJson = useMemo((): GeoJSON.Feature | null => {
    if (!parcel || parcel.coordinates.length < 2) return null;
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: parcel.coordinates.map(([lat, lng]) => [lng, lat]),
      },
      properties: {},
    };
  }, [parcel]);

  const distance = parcel ? routeDistance(parcel.coordinates) : 0;
  const claimedDate = parcel
    ? new Date(parcel.claimed_at).toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      })
    : '';
  const claimedTime = parcel
    ? new Date(parcel.claimed_at).toLocaleTimeString(undefined, {
        hour: 'numeric', minute: '2-digit', hour12: true,
      })
    : '';

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#f5c518" size="large" />
      </View>
    );
  }

  if (error || !parcel) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.errorText}>{error ?? 'Parcel not found'}</Text>
        <Pressable onPress={() => router.back()} style={styles.backBtnFloating}>
          <Text style={styles.backBtnText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* ── Map ─────────────────────────────────────────────────────────── */}
      <MapboxGL.MapView
        style={StyleSheet.absoluteFillObject}
        styleURL="mapbox://styles/mapbox/dark-v11"
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}>

        <MapboxGL.Camera ref={cameraRef} zoomLevel={14} animationMode="none" />

        {parcelGeoJson && (
          <MapboxGL.ShapeSource id="detail-parcel" shape={parcelGeoJson}>
            <MapboxGL.FillLayer
              id="detail-fill"
              style={{ fillColor: ['get', 'color'], fillOpacity: 0.2 }}
            />
            <MapboxGL.LineLayer
              id="detail-stroke"
              style={{ lineColor: ['get', 'color'], lineWidth: 3, lineCap: 'round', lineJoin: 'round' }}
            />
          </MapboxGL.ShapeSource>
        )}

        {routeGeoJson && (
          <MapboxGL.ShapeSource id="detail-route" shape={routeGeoJson}>
            <MapboxGL.LineLayer
              id="detail-route-line"
              style={{
                lineColor: parcel.color,
                lineWidth: 2,
                lineDasharray: [4, 3],
                lineCap: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        )}
      </MapboxGL.MapView>

      {/* ── Back button ──────────────────────────────────────────────────── */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.backBtn, { top: insets.top + 12 }]}>
        <FontAwesome name="chevron-left" size={14} color="#fff" />
      </Pressable>

      {/* ── Info sheet ───────────────────────────────────────────────────── */}
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.sheetHandle} />

        {/* Owner row */}
        <View style={styles.ownerRow}>
          <View style={[styles.ownerAvatar, { backgroundColor: parcel.color }]}>
            <Text style={styles.ownerAvatarText}>
              {initials(parcel.owner_display_name ?? parcel.owner_username)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ownerUsername}>
              @{parcel.owner_username ?? 'unknown'}
            </Text>
            {parcel.owner_display_name ? (
              <Text style={styles.ownerDisplayName}>{parcel.owner_display_name}</Text>
            ) : null}
          </View>
          <View style={styles.activityBadge}>
            <MaterialCommunityIcons
              name={activityIcon(parcel.activity)}
              size={14}
              color="rgba(255,255,255,0.6)"
              style={{ marginRight: 4 }}
            />
            <Text style={styles.activityText}>{activityLabel(parcel.activity)}</Text>
          </View>
        </View>

        {/* Stats grid */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={styles.statsRow}>
            <StatCell label="AREA"     value={formatAreaM2(parcel.area_sqm)} accent />
            <StatCell label="DISTANCE" value={distance > 0 ? formatDistanceM(distance) : '—'} />
            <StatCell label="POINTS"   value={parcel.points.toLocaleString()} accent />
            <StatCell label="DATE"     value={claimedDate} />
            <StatCell label="TIME"     value={claimedTime} />
          </View>
        </ScrollView>

        {/* Replay route button — only shown when route data exists */}
        {parcel.route_coordinates && parcel.route_coordinates.length >= 2 ? (
          <Pressable
            style={({ pressed }) => [styles.replayBtn, pressed && { opacity: 0.8 }]}
            onPress={() => router.push(`/tracking/replay?id=${parcel.id}`)}>
            <Text style={styles.replayBtnText}>▶  Replay Route</Text>
          </Pressable>
        ) : null}

        {/* Attribution */}
        <Text style={styles.attribution}>© Mapbox © OpenStreetMap</Text>
      </View>
    </View>
  );
}

function StatCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const AMBER   = '#f5c518';
const BG      = '#0e0e10';
const CARD_BG = '#13131a';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 16,
  },

  // Back button
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(14,14,16,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnFloating: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  backBtnText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: '#fff',
  },

  // Sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 16,
  },

  // Owner
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  ownerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerAvatarText: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 16,
    color: '#0e0e10',
    lineHeight: 20,
  },
  ownerUsername: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 22,
    color: '#fff',
    letterSpacing: 0.3,
  },
  ownerDisplayName: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 1,
  },
  activityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  activityText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCell: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 80,
  },
  statLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 9,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  statValue: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 16,
    color: '#fff',
  },
  statValueAccent: {
    color: AMBER,
  },

  replayBtn: {
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 10,
  },
  replayBtnText: {
    fontFamily: 'Syne_800ExtraBold',
    fontSize: 14,
    color: '#0e0e10',
    letterSpacing: 0.3,
  },
  attribution: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.2)',
    fontFamily: 'Rajdhani_600SemiBold',
    textAlign: 'center',
  },
});

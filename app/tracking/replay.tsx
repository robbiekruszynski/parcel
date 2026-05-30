/**
 * app/tracking/replay.tsx
 *
 * Standalone route replay screen — accessible from any parcel detail view.
 * Fetches route_coordinates + polygon from the parcel by ID, then animates
 * the GPS trail on a Mapbox map with speed controls and a progress bar.
 *
 * Navigation: router.push('/tracking/replay?id=PARCEL_ID')
 */

import MapboxGL from '@rnmapbox/maps';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';

import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReplayParcel {
  color: string;
  activity: string;
  claimed_at: string;
  area_sqm: number | null;
  points: number;
  owner_username: string | null;
  /** Polygon boundary — [lat, lng][] */
  coordinates: [number, number][];
  /** Full GPS trail — [lat, lng][] — may be null for old parcels */
  route_coordinates: [number, number][] | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function routeToLineString(pairs: [number, number][]) {
  return {
    type: 'Feature' as const,
    geometry: {
      type: 'LineString' as const,
      coordinates: pairs.map(([lat, lng]) => [lng, lat]),
    },
    properties: {},
  };
}

function polygonToFeatureCollection(pairs: [number, number][], color: string) {
  const ring: [number, number][] = pairs.map(([lat, lng]) => [lng, lat]);
  if (ring.length > 0) ring.push(ring[0]);
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
        properties: { color },
      },
    ],
  };
}

function routeBounds(
  pairs: [number, number][],
): [[number, number], [number, number]] | null {
  if (pairs.length === 0) return null;
  let minLat = pairs[0][0], maxLat = pairs[0][0];
  let minLng = pairs[0][1], maxLng = pairs[0][1];
  for (const [lat, lng] of pairs) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

function fmtArea(m2: number | null): string {
  if (m2 == null) return '—';
  if (m2 < 10000) return `${Math.round(m2)} m²`;
  return `${(m2 / 10000).toFixed(2)} ha`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INTERVAL_MS = 18; // ~55 fps base tick
const DARK   = '#0e0e10';
const AMBER  = '#f5c518';
const MUTED  = 'rgba(255,255,255,0.45)';
const BORDER = 'rgba(255,255,255,0.1)';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ReplayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<MapboxGL.Camera>(null);

  const [parcel,  setParcel]  = useState<ReplayParcel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  // Replay state
  const [animRoute,  setAnimRoute]  = useState<[number, number][]>([]);
  const [progress,   setProgress]   = useState(0);
  const [showPoly,   setShowPoly]   = useState(false);
  const [polyAlpha,  setPolyAlpha]  = useState(0);
  const [playing,    setPlaying]    = useState(false);
  const [finished,   setFinished]   = useState(false);

  const animIndexRef = useRef(0);
  const polyOpacity  = useRef(new Animated.Value(0)).current;
  const speedRef     = useRef(1);
  const [speed, setSpeedState] = useState(1);
  const setSpeed = (s: number) => { speedRef.current = s; setSpeedState(s); };

  // ── Fetch parcel ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id) { setError('No parcel ID'); setLoading(false); return; }
    void (async () => {
      const { data, error: err } = await supabase
        .from('parcels')
        .select(`
          color, activity, claimed_at, area_sqm, points,
          coordinates, route_coordinates,
          profiles ( username )
        `)
        .eq('id', id)
        .single();

      if (err || !data) {
        setError(err?.message ?? 'Parcel not found');
      } else {
        const row = data as unknown as {
          color: string | null;
          activity: string | null;
          claimed_at: string;
          area_sqm: number | null;
          points: number | null;
          coordinates: [number, number][] | null;
          route_coordinates: [number, number][] | null;
          profiles: { username: string | null } | null;
        };
        setParcel({
          color:             row.color ?? AMBER,
          activity:          row.activity ?? 'walking',
          claimed_at:        row.claimed_at,
          area_sqm:          row.area_sqm,
          points:            row.points ?? 0,
          owner_username:    row.profiles?.username ?? null,
          coordinates:       row.coordinates ?? [],
          route_coordinates: row.route_coordinates ?? null,
        });
      }
      setLoading(false);
    })();
  }, [id]);

  // ── Fit camera once parcel loads ──────────────────────────────────────────
  useEffect(() => {
    if (!parcel) return;
    const source = parcel.route_coordinates ?? parcel.coordinates;
    if (source.length < 2) return;
    const bounds = routeBounds(source);
    if (!bounds) return;
    setTimeout(() => {
      cameraRef.current?.fitBounds(bounds[1], bounds[0], [80, 40, 200, 40], 600);
    }, 350);
  }, [parcel]);

  // ── Start / restart animation ─────────────────────────────────────────────
  const startReplay = () => {
    if (!parcel?.route_coordinates?.length) return;
    const full = parcel.route_coordinates;

    animIndexRef.current = 0;
    setAnimRoute([]);
    setProgress(0);
    setShowPoly(false);
    setFinished(false);
    polyOpacity.setValue(0);
    setPolyAlpha(0);
    setPlaying(true);

    const id = setInterval(() => {
      animIndexRef.current = Math.min(
        animIndexRef.current + speedRef.current,
        full.length,
      );
      setAnimRoute(full.slice(0, animIndexRef.current));
      setProgress(animIndexRef.current / full.length);

      if (animIndexRef.current >= full.length) {
        clearInterval(id);
        setPlaying(false);
        setFinished(true);

        // Fade in the polygon
        setShowPoly(true);
        polyOpacity.removeAllListeners();
        Animated.timing(polyOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: false,
        }).start();
        polyOpacity.addListener(({ value }) => setPolyAlpha(value));
      }
    }, INTERVAL_MS);

    return () => { clearInterval(id); polyOpacity.removeAllListeners(); };
  };

  // ── Derived GeoJSON ───────────────────────────────────────────────────────
  const routeGeoJson  = animRoute.length >= 2 ? routeToLineString(animRoute) : null;
  const polyGeoJson   = showPoly && parcel && parcel.coordinates.length >= 3
    ? polygonToFeatureCollection(parcel.coordinates, parcel.color)
    : null;
  const hasRoute      = (parcel?.route_coordinates?.length ?? 0) >= 2;
  const parcelColor   = parcel?.color ?? AMBER;

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={AMBER} size="large" />
      </View>
    );
  }

  if (error || !parcel) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.errorText}>{error ?? 'Parcel not found'}</Text>
        <Pressable style={styles.backPill} onPress={() => router.back()}>
          <Text style={styles.backPillText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!hasRoute) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.errorText}>No route data for this parcel.</Text>
        <Text style={styles.errorSub}>
          Route replay is available for parcels claimed after the{'\n'}latest app update.
        </Text>
        <Pressable style={styles.backPill} onPress={() => router.back()}>
          <Text style={styles.backPillText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>

      {/* ── Map ───────────────────────────────────────────────────────────── */}
      <MapboxGL.MapView
        style={StyleSheet.absoluteFillObject}
        styleURL="mapbox://styles/mapbox/dark-v11"
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}>

        <MapboxGL.Camera ref={cameraRef} animationMode="none" />

        {/* Animated GPS trail */}
        {routeGeoJson ? (
          <MapboxGL.ShapeSource id="replay-route" shape={routeGeoJson}>
            <MapboxGL.LineLayer
              id="replay-route-line"
              style={{
                lineColor: parcelColor,
                lineWidth: 3,
                lineOpacity: 0.9,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        ) : null}

        {/* Polygon — fades in when replay finishes */}
        {polyGeoJson ? (
          <MapboxGL.ShapeSource id="replay-poly" shape={polyGeoJson}>
            <MapboxGL.FillLayer
              id="replay-poly-fill"
              style={{ fillColor: ['get', 'color'], fillOpacity: polyAlpha * 0.3 }}
            />
            <MapboxGL.LineLayer
              id="replay-poly-border"
              style={{
                lineColor: ['get', 'color'],
                lineWidth: 2.5,
                lineOpacity: polyAlpha * 0.85,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        ) : null}
      </MapboxGL.MapView>

      {/* ── Progress bar ──────────────────────────────────────────────────── */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            {
              width: `${progress * 100}%` as `${number}%`,
              backgroundColor: parcelColor,
            },
          ]}
        />
      </View>

      {/* ── Back button ───────────────────────────────────────────────────── */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.backBtn, { top: insets.top + 12 }]}>
        <FontAwesome name="chevron-left" size={14} color="#fff" />
      </Pressable>

      {/* ── Speed controls ────────────────────────────────────────────────── */}
      {playing ? (
        <View style={[styles.speedRow, { top: insets.top + 12 }]}>
          {([1, 2, 4] as const).map((s) => (
            <Pressable
              key={s}
              style={[styles.speedBtn, speed === s && { backgroundColor: parcelColor }]}
              onPress={() => setSpeed(s)}>
              <Text style={[styles.speedBtnText, speed === s && { color: DARK }]}>
                {s}×
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* ── Bottom sheet ──────────────────────────────────────────────────── */}
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>

        {/* Meta row */}
        <View style={styles.metaRow}>
          <View style={[styles.colorDot, { backgroundColor: parcelColor }]} />
          <Text style={styles.metaOwner}>
            @{parcel.owner_username ?? 'unknown'}
          </Text>
          <Text style={styles.metaDate}>{fmtDate(parcel.claimed_at)}</Text>
        </View>

        {/* Stat pills */}
        <View style={styles.pillsRow}>
          <View style={styles.pill}>
            <Text style={styles.pillLabel}>AREA</Text>
            <Text style={styles.pillValue}>{fmtArea(parcel.area_sqm)}</Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillLabel}>POINTS</Text>
            <Text style={[styles.pillValue, { color: parcelColor }]}>
              {parcel.points.toLocaleString()}
            </Text>
          </View>
          <View style={styles.pill}>
            <Text style={styles.pillLabel}>ROUTE PTS</Text>
            <Text style={styles.pillValue}>
              {parcel.route_coordinates?.length ?? 0}
            </Text>
          </View>
        </View>

        {/* Action button */}
        {!playing ? (
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: parcelColor },
              pressed && { opacity: 0.85 },
            ]}
            onPress={startReplay}>
            <Text style={styles.actionBtnText}>
              {finished ? '↩  REPLAY AGAIN' : '▶  PLAY ROUTE'}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.playingIndicator}>
            <View style={[styles.playingDot, { backgroundColor: parcelColor }]} />
            <Text style={styles.playingText}>Replaying route…</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: DARK },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },

  errorText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 15,
    color: MUTED,
    textAlign: 'center',
  },
  errorSub: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    lineHeight: 18,
  },
  backPill: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 8,
  },
  backPillText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: '#fff',
  },

  // Progress bar
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  progressFill: { height: 3 },

  // Back button
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(14,14,16,0.8)',
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Speed controls
  speedRow: {
    position: 'absolute',
    right: 16,
    flexDirection: 'row',
    gap: 6,
  },
  speedBtn: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  speedBtnText: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 12,
    color: '#fff',
  },

  // Bottom sheet
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#13131a',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  metaOwner: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 18,
    color: '#fff',
    flex: 1,
  },
  metaDate: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 11,
    color: MUTED,
  },

  // Stat pills
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  pill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  pillLabel: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 9,
    color: MUTED,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  pillValue: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 16,
    color: '#fff',
  },

  // Action button
  actionBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  actionBtnText: {
    fontFamily: 'Syne_800ExtraBold',
    fontSize: 15,
    color: DARK,
    letterSpacing: 0.3,
  },

  // Playing indicator
  playingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
  },
  playingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  playingText: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 13,
    color: MUTED,
  },
});

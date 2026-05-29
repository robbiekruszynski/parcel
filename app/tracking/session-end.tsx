import MapboxGL from '@rnmapbox/maps';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSessionStore } from '@/stores/sessionStore';
import { useLocationStore } from '@/stores/locationStore';
import { useSessionResultStore } from '@/stores/sessionResultStore';
import { useStravaStore } from '@/stores/stravaStore';

// ─── Confetti ─────────────────────────────────────────────────────────────────

const CONFETTI_COLORS = [
  '#f5c518', '#f5c518', '#f5c518', // amber — triple weight, brand primary
  '#22d3ee', '#a78bfa', '#34d399', '#fb923c', '#f472b6', '#ffffff',
];

const PARTICLE_COUNT = 72;

interface Particle {
  id: number;
  x: number;
  color: string;
  w: number;
  h: number;
  yAnim: Animated.Value;
  rotAnim: Animated.Value;
  delay: number;
  duration: number;
}

function makeParticles(screenW: number): Particle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
    id: i,
    x: Math.random() * screenW,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    w: 5 + Math.random() * 8,
    h: 8 + Math.random() * 7,
    yAnim: new Animated.Value(-40),
    rotAnim: new Animated.Value(0),
    delay: Math.random() * 1000,
    duration: 2200 + Math.random() * 1400,
  }));
}

function ConfettiOverlay() {
  const { width, height } = useWindowDimensions();

  const particlesRef = useRef<Particle[]>([]);
  if (particlesRef.current.length === 0) {
    particlesRef.current = makeParticles(width);
  }

  useEffect(() => {
    const anims = particlesRef.current.map((p) =>
      Animated.parallel([
        Animated.timing(p.yAnim, {
          toValue: height + 80,
          duration: p.duration,
          delay: p.delay,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(p.rotAnim, {
          toValue: 360 * (2 + Math.floor(Math.random() * 3)),
          duration: p.duration,
          delay: p.delay,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    );
    Animated.parallel(anims).start();

    return () => {
      particlesRef.current.forEach((p) => {
        p.yAnim.stopAnimation();
        p.rotAnim.stopAnimation();
      });
    };
  }, [height]);

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particlesRef.current.map((p) => (
        <Animated.View
          key={p.id}
          style={{
            position: 'absolute',
            top: 0,
            left: p.x,
            width: p.w,
            height: p.h,
            backgroundColor: p.color,
            borderRadius: 2,
            transform: [
              { translateY: p.yAnim },
              {
                rotate: p.rotAnim.interpolate({
                  inputRange: [0, 360],
                  outputRange: ['0deg', '360deg'],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

function fmtDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m ${sec < 10 ? '0' : ''}${sec}s`;
}

function fmtPace(distM: number, durationMs: number, activityType: string): string {
  if (distM < 10 || durationMs < 1000) return '—';
  const isCycling = activityType === 'cycling';
  const distKm = distM / 1000;
  const durationH = durationMs / 3_600_000;
  if (isCycling) return `${(distKm / durationH).toFixed(1)} km/h`;
  const minPerKm = durationMs / 60000 / distKm;
  const pMin = Math.floor(minPerKm);
  const pSec = Math.round((minPerKm - pMin) * 60);
  return `${pMin}:${pSec < 10 ? '0' : ''}${pSec} /km`;
}

function fmtArea(m2: number | null): string {
  if (m2 == null) return '—';
  if (m2 < 10000) return `${Math.round(m2)} m²`;
  return `${(m2 / 10000).toFixed(2)} ha`;
}

function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

function tierLabel(tier: string | null): string {
  if (!tier) return '';
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function activityLabel(type: string): string {
  const map: Record<string, string> = {
    walking: 'Walk',
    running: 'Run',
    cycling: 'Ride',
    rollerblading: 'Rollerblade',
    skating: 'Skate',
  };
  return map[type] ?? type;
}

function stravaStatusText(connected: boolean, status: string): string {
  if (!connected) return 'Not connected';
  if (status === 'uploading') return 'Uploading…';
  if (status === 'success') return 'Uploaded ✓';
  if (status === 'failed') return 'Upload failed';
  return 'Will upload';
}

function routeToGeoJson(coords: { lat: number; lng: number }[]) {
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: coords.map((c) => [c.lng, c.lat]),
        },
        properties: {},
      },
    ],
  };
}

function polygonToGeoJson(coords: [number, number][]) {
  const ring = coords.map(([lat, lng]) => [lng, lat] as [number, number]);
  if (ring.length > 0) ring.push(ring[0]);
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
        properties: {},
      },
    ],
  };
}

function routeBounds(
  coords: { lat: number; lng: number }[],
): [[number, number], [number, number]] | null {
  if (coords.length === 0) return null;
  let minLng = coords[0].lng, maxLng = coords[0].lng;
  let minLat = coords[0].lat, maxLat = coords[0].lat;
  for (const c of coords) {
    if (c.lng < minLng) minLng = c.lng;
    if (c.lng > maxLng) maxLng = c.lng;
    if (c.lat < minLat) minLat = c.lat;
    if (c.lat > maxLat) maxLat = c.lat;
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROUTE_ANIM_INTERVAL_MS = 18;
const DARK    = '#0e0e10';
const SURFACE = '#13131a';
const AMBER   = '#f5c518';
const MUTED   = 'rgba(255,255,255,0.45)';
const BORDER  = 'rgba(255,255,255,0.08)';

// ─── Component ────────────────────────────────────────────────────────────────

export default function SessionEndScreen() {
  const result      = useSessionResultStore((s) => s.result);
  const clearResult = useSessionResultStore((s) => s.clearResult);

  // 'celebrate' shows confetti hero; 'replay' shows map animation + stats.
  // Skip celebrate entirely if nothing was claimed.
  const [phase, setPhase] = useState<'celebrate' | 'replay'>(
    () => (result?.claimedParcel ? 'celebrate' : 'replay'),
  );

  const cameraRef    = useRef<MapboxGL.Camera>(null);
  const [animatedRoute, setAnimatedRoute] = useState<{ lat: number; lng: number }[]>([]);
  const [progress,      setProgress]      = useState(0);
  const animIndexRef = useRef(0);
  const polyOpacity  = useRef(new Animated.Value(0)).current;
  const [showPoly,  setShowPoly]  = useState(false);
  const [polyAlpha, setPolyAlpha] = useState(0);

  // Playback speed — stored in both state (for UI) and ref (read inside interval).
  const [speed, setSpeedState] = useState(1);
  const speedRef = useRef(1);
  const setSpeed = (s: number) => {
    speedRef.current = s;
    setSpeedState(s);
  };

  // End in-memory session on mount.
  useEffect(() => {
    useSessionStore.getState().endSession();
  }, []);

  // Mirror live Strava upload status into the stored result.
  useEffect(() => {
    return useStravaStore.subscribe((s) => {
      const current = useSessionResultStore.getState().result;
      if (!current) return;
      useSessionResultStore.getState().setResult({
        ...current,
        stravaConnected:    s.isConnected,
        stravaUploadStatus: s.uploadStatus,
      });
    });
  }, []);

  // Animate route draw — triggered when entering replay phase.
  useEffect(() => {
    if (!result || result.route.length === 0) return;
    if (phase !== 'replay') return;

    animIndexRef.current = 0;
    setAnimatedRoute([]);
    setProgress(0);
    setShowPoly(false);
    polyOpacity.setValue(0);
    setPolyAlpha(0);

    const full = result.route;

    const id = setInterval(() => {
      animIndexRef.current = Math.min(
        animIndexRef.current + speedRef.current,
        full.length,
      );
      setAnimatedRoute(full.slice(0, animIndexRef.current));
      setProgress(animIndexRef.current / full.length);

      if (animIndexRef.current >= full.length) {
        clearInterval(id);
        if (result.claimedParcel && result.parcelCoords) {
          setShowPoly(true);
          polyOpacity.removeAllListeners();
          Animated.timing(polyOpacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: false,
          }).start();
          polyOpacity.addListener(({ value }) => setPolyAlpha(value));
        }
      }
    }, ROUTE_ANIM_INTERVAL_MS);

    return () => {
      clearInterval(id);
      polyOpacity.removeAllListeners();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, phase]);

  const handleMapLoad = () => {
    if (!result || result.route.length === 0) return;
    const bounds = routeBounds(result.route);
    if (!bounds) return;
    cameraRef.current?.fitBounds(bounds[1], bounds[0], [48, 48, 48, 48], 400);
  };

  const handleDone = () => {
    clearResult();
    useLocationStore.getState().resetRoute();
    router.replace('/(tabs)/map');
  };

  const handleShare = async () => {
    if (!result) return;
    const lines: string[] = [`${activityLabel(result.activityType)} session complete!`];
    lines.push(`Distance: ${fmtDistance(result.distanceM)}`);
    if (result.startedAt) lines.push(`Duration: ${fmtDuration(result.endedAt - result.startedAt)}`);
    if (result.claimedParcel) {
      lines.push(`Parcel claimed: +${result.parcelPoints} pts`);
      if (result.parcelTier) lines.push(`Tier: ${tierLabel(result.parcelTier)}`);
    }
    lines.push('Tracked with Parcel 🗺️');
    await Share.share({ message: lines.join('\n') });
  };

  // ── No result fallback ──────────────────────────────────────────────────────
  if (!result) {
    return (
      <SafeAreaView style={styles.fallback}>
        <Text style={styles.fallbackText}>No session data.</Text>
        <Pressable style={styles.doneBtn} onPress={() => router.replace('/(tabs)/map')}>
          <Text style={styles.doneBtnText}>Done</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const durationMs  = result.startedAt ? result.endedAt - result.startedAt : 0;
  const parcelColor = result.parcelColor || AMBER;
  const routeGeoJson = animatedRoute.length >= 2 ? routeToGeoJson(animatedRoute) : null;
  const polyGeoJson  = showPoly && result.parcelCoords
    ? polygonToGeoJson(result.parcelCoords)
    : null;

  // ── CELEBRATE phase ─────────────────────────────────────────────────────────
  if (phase === 'celebrate') {
    return (
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>

        {/* Confetti — rendered behind content, non-interactive */}
        <ConfettiOverlay />

        {/* Hero content */}
        <View style={styles.celebrateContainer}>

          {/* Hexagon stamp */}
          <View style={[styles.celebrateStamp, { borderColor: parcelColor }]}>
            <Text style={[styles.celebrateStampGlyph, { color: parcelColor }]}>⬡</Text>
          </View>

          {/* Headline */}
          <Text style={styles.celebrateTitle}>TERRITORY{'\n'}CLAIMED</Text>

          {/* Points */}
          <Text style={[styles.celebratePoints, { color: parcelColor }]}>
            +{result.parcelPoints} pts
          </Text>

          {/* Tier */}
          {result.parcelTier ? (
            <View style={[styles.tierBadge, { borderColor: parcelColor }]}>
              <Text style={[styles.tierText, { color: parcelColor }]}>
                {tierLabel(result.parcelTier)}
              </Text>
            </View>
          ) : null}

          {/* Area */}
          {result.parcelAreaM2 != null ? (
            <Text style={styles.celebrateSub}>{fmtArea(result.parcelAreaM2)}</Text>
          ) : null}

          {/* Co-owners */}
          {result.coOwners.length > 0 ? (
            <Text style={styles.celebrateSub}>
              with {result.coOwners.join(', ')}
            </Text>
          ) : null}

          {/* Multiplier badge for group claims */}
          {result.coOwners.length > 0 ? (
            <View style={styles.multiplierBadge}>
              <Text style={styles.multiplierText}>
                {result.coOwners.length + 1}× GROUP BONUS
              </Text>
            </View>
          ) : null}
        </View>

        {/* Bottom CTAs */}
        <View style={styles.celebrateBtnContainer}>
          <Pressable
            style={({ pressed }) => [styles.replayBtn, pressed && { opacity: 0.85 }]}
            onPress={() => setPhase('replay')}>
            <Text style={styles.replayBtnText}>▶  WATCH REPLAY</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.65 }]}
            onPress={handleDone}>
            <Text style={styles.skipBtnText}>Skip</Text>
          </Pressable>
        </View>

      </SafeAreaView>
    );
  }

  // ── REPLAY phase ────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>

      {/* Map — top 45% */}
      <View style={styles.mapContainer}>
        <MapboxGL.MapView
          style={StyleSheet.absoluteFillObject}
          styleURL="mapbox://styles/mapbox/dark-v11"
          scrollEnabled={false}
          zoomEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          onDidFinishLoadingMap={handleMapLoad}>
          <MapboxGL.Camera ref={cameraRef} />

          {/* Animated route line */}
          {routeGeoJson ? (
            <MapboxGL.ShapeSource id="recap-route" shape={routeGeoJson}>
              <MapboxGL.LineLayer
                id="recap-route-line"
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

          {/* Claimed parcel polygon */}
          {polyGeoJson ? (
            <MapboxGL.ShapeSource id="recap-poly" shape={polyGeoJson}>
              <MapboxGL.FillLayer
                id="recap-poly-fill"
                style={{ fillColor: parcelColor, fillOpacity: polyAlpha * 0.35 }}
              />
              <MapboxGL.LineLayer
                id="recap-poly-border"
                style={{
                  lineColor: parcelColor,
                  lineWidth: 2,
                  lineOpacity: polyAlpha * 0.8,
                }}
              />
            </MapboxGL.ShapeSource>
          ) : null}
        </MapboxGL.MapView>

        {/* Playback progress bar — sits on the map bottom edge */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress * 100}%` as `${number}%`, backgroundColor: parcelColor },
            ]}
          />
        </View>

        {/* Speed controls — overlaid bottom-right of map */}
        <View style={styles.speedRow}>
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
      </View>

      {/* Stats card — bottom 55% */}
      <ScrollView
        style={styles.sheet}
        contentContainerStyle={styles.sheetContent}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.headerRow}>
          <Text style={styles.headerActivity}>{activityLabel(result.activityType)}</Text>
          <Text style={styles.headerDate}>{fmtDateTime(result.endedAt)}</Text>
        </View>

        {/* Points hero */}
        {result.claimedParcel ? (
          <View style={styles.heroRow}>
            <Text style={styles.heroPoints}>+{result.parcelPoints} pts</Text>
            {result.parcelTier ? (
              <View style={[styles.tierBadge, { borderColor: parcelColor }]}>
                <Text style={[styles.tierText, { color: parcelColor }]}>
                  {tierLabel(result.parcelTier)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={styles.noClaimText}>Session recorded</Text>
        )}

        {/* 2×2 stats grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{fmtDistance(result.distanceM)}</Text>
            <Text style={styles.statLabel}>Distance</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{durationMs > 0 ? fmtDuration(durationMs) : '—'}</Text>
            <Text style={styles.statLabel}>Duration</Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>
              {durationMs > 0 ? fmtPace(result.distanceM, durationMs, result.activityType) : '—'}
            </Text>
            <Text style={styles.statLabel}>
              {result.activityType === 'cycling' ? 'Speed' : 'Pace'}
            </Text>
          </View>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{fmtArea(result.parcelAreaM2)}</Text>
            <Text style={styles.statLabel}>Area</Text>
          </View>
        </View>

        {/* Co-owners */}
        {result.coOwners.length > 0 ? (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>With</Text>
            <Text style={styles.infoValue}>{result.coOwners.join(', ')}</Text>
          </View>
        ) : null}

        {/* Strava */}
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Strava</Text>
          <Text
            style={[
              styles.infoValue,
              result.stravaUploadStatus === 'success' && { color: '#4ade80' },
              result.stravaUploadStatus === 'failed'  && { color: '#f87171' },
            ]}>
            {stravaStatusText(result.stravaConnected, result.stravaUploadStatus)}
          </Text>
        </View>

        {/* Buttons */}
        <View style={styles.btnRow}>
          <Pressable
            style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.75 }]}
            onPress={handleShare}>
            <Text style={styles.shareBtnText}>Share</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.85 }]}
            onPress={handleDone}>
            <Text style={styles.doneBtnText}>Done</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: DARK },

  // ── Celebrate ──
  celebrateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  celebrateStamp: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  celebrateStampGlyph: {
    fontSize: 44,
    lineHeight: 52,
  },
  celebrateTitle: {
    fontFamily: 'Syne_800ExtraBold',
    fontSize: 42,
    color: '#ffffff',
    textAlign: 'center',
    letterSpacing: -1,
    lineHeight: 46,
  },
  celebratePoints: {
    fontFamily: 'Syne_800ExtraBold',
    fontSize: 54,
    letterSpacing: -2,
    marginTop: 4,
  },
  celebrateSub: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    marginTop: -4,
  },
  multiplierBadge: {
    backgroundColor: 'rgba(245,197,24,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.35)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 4,
  },
  multiplierText: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 13,
    color: AMBER,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  celebrateBtnContainer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    gap: 10,
  },
  replayBtn: {
    backgroundColor: AMBER,
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
  },
  replayBtnText: {
    fontFamily: 'Syne_800ExtraBold',
    fontSize: 15,
    color: DARK,
    letterSpacing: 0.5,
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  skipBtnText: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 13,
    color: MUTED,
  },

  // ── Replay ──
  mapContainer: {
    flex: 45,
    minHeight: 0,
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  progressFill: {
    height: 3,
  },
  speedRow: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    gap: 6,
  },
  speedBtn: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  speedBtnText: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 12,
    color: '#ffffff',
  },
  sheet: {
    flex: 55,
    backgroundColor: SURFACE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  sheetContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 0,
  },

  // ── Shared ──
  tierBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tierText: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerActivity: {
    fontFamily: 'Syne_800ExtraBold',
    fontSize: 22,
    color: '#ffffff',
  },
  headerDate: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 11,
    color: MUTED,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  heroPoints: {
    fontFamily: 'Syne_800ExtraBold',
    fontSize: 38,
    color: AMBER,
    letterSpacing: -1,
  },
  noClaimText: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 14,
    color: MUTED,
    marginBottom: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 18,
  },
  statCell: {
    width: '50%',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: BORDER,
    gap: 3,
  },
  statValue: {
    fontFamily: 'Rajdhani_700Bold',
    fontSize: 20,
    color: '#ffffff',
  },
  statLabel: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 10,
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderColor: BORDER,
  },
  infoLabel: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 12,
    color: MUTED,
  },
  infoValue: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: '#ffffff',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  shareBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  shareBtnText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 15,
    color: '#ffffff',
  },
  doneBtn: {
    flex: 2,
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  doneBtnText: {
    fontFamily: 'Rajdhani_700Bold',
    fontSize: 15,
    color: DARK,
  },
  fallback: {
    flex: 1,
    backgroundColor: DARK,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  fallbackText: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 14,
    color: MUTED,
  },
});

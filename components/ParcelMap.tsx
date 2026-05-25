/**
 * ParcelMap.tsx
 *
 * Full-screen Mapbox map component:
 *  - Dark base map (Mapbox dark-v11 style)
 *  - All claimed parcels rendered as GeoJSON fill + stroke layers
 *    (single draw call, data-driven colour — much faster than individual Polygons)
 *  - Live GPS route as a LineLayer
 *  - User position as a custom PointAnnotation
 *  - Tappable parcels → ParcelDetailSheet modal
 *  - Locate-me float button
 *
 * Mount alongside ParcelRecordingOverlay for the full recording UX.
 * Does NOT own the tracking lifecycle — use useParcelTracking for that.
 */

import MapboxGL from '@rnmapbox/maps';
import { router } from 'expo-router';

// Inline type — OnPressEvent is not re-exported from the main @rnmapbox/maps index
type OnPressEvent = {
  features: Array<GeoJSON.Feature & { properties: Record<string, unknown> | null }>;
  coordinates: { latitude: number; longitude: number };
  point: { x: number; y: number };
};
import { useEffect, useMemo, useRef } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatAreaM2 } from '@/lib/parcelGeometry';
import { useLocationStore } from '@/stores/locationStore';
import { useParcelStore, type Parcel } from '@/stores/parcelStore';

// ─── Mapbox init ──────────────────────────────────────────────────────────────

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');

// ─── Constants ────────────────────────────────────────────────────────────────

const AMBER        = '#f5c518';
const CARD_BG      = '#13131a';
const FONT_LABEL   = 'Rajdhani_600SemiBold';
const FONT_DISPLAY = 'BarlowCondensed_900Black';

const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11';
const INIT_COORD: [number, number] = [0, 20]; // [lng, lat] — world view

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ParcelMapProps {
  /** Expose the camera ref so a parent can fly to coordinates. */
  cameraRef?: React.RefObject<MapboxGL.Camera>;
  /**
   * Only render parcels for this activity type.
   * Undefined = show all activities.
   */
  activityFilter?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ParcelMap({ cameraRef: externalCameraRef, activityFilter }: ParcelMapProps) {
  const insets = useSafeAreaInsets();

  const internalCameraRef = useRef<MapboxGL.Camera>(null);
  const cameraRef = externalCameraRef ?? internalCameraRef;

  const parcels        = useParcelStore((s) => s.parcels);
  const selectedParcel = useParcelStore((s) => s.selectedParcel);
  const route          = useLocationStore((s) => s.route);
  const position       = useLocationStore((s) => s.position);
  const isTracking     = useLocationStore((s) => s.isTracking);
  const isPaused       = useLocationStore((s) => s.isPaused);

  // ── Fly to user on first fix ───────────────────────────────────────────────
  const hasCenteredRef = useRef(false);
  useEffect(() => {
    if (position && !hasCenteredRef.current) {
      hasCenteredRef.current = true;
      cameraRef.current?.setCamera({
        centerCoordinate: [position.lng, position.lat],
        zoomLevel: 15,
        animationDuration: 700,
        animationMode: 'flyTo',
      });
    }
  }, [position]);

  // ── Follow user while tracking (preserves zoom) ───────────────────────────
  useEffect(() => {
    if (!position || (!isTracking && !isPaused)) return;
    if (isPaused) return;
    cameraRef.current?.setCamera({
      centerCoordinate: [position.lng, position.lat],
      animationDuration: 450,
      animationMode: 'easeTo',
    });
  }, [position?.lat, position?.lng, isTracking, isPaused]);

  // ── GeoJSON: claimed parcels (filtered by activity layer) ─────────────────
  const parcelsGeoJson = useMemo((): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: parcels
      .filter((p) => p.coordinates?.length >= 3)
      .filter((p) => !activityFilter || p.activity === activityFilter)
      .map((p) => ({
        type: 'Feature',
        id: p.id,
        geometry: {
          type: 'Polygon',
          // Supabase stores [lat, lng] — GeoJSON needs [lng, lat]
          coordinates: [
            [
              ...p.coordinates.map(([lat, lng]) => [lng, lat]),
              [p.coordinates[0][1], p.coordinates[0][0]], // close ring
            ],
          ],
        },
        properties: {
          id:       p.id,
          color:    p.color,
          username: p.owner_username ? `@${p.owner_username}` : '',
        },
      })),
  }), [parcels, activityFilter]);

  // ── GeoJSON: live route polyline ───────────────────────────────────────────
  const routeGeoJson = useMemo((): GeoJSON.Feature | null => {
    if (route.length < 2) return null;
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: route.map((c) => [c.lng, c.lat]),
      },
      properties: {},
    };
  }, [route]);

  // ── Parcel tap handler ─────────────────────────────────────────────────────
  const onParcelPress = (e: OnPressEvent) => {
    const feature = e.features[0];
    if (!feature?.properties?.id) return;
    const parcel = parcels.find((p) => p.id === feature.properties!.id);
    if (parcel) useParcelStore.getState().setSelectedParcel(parcel);
  };

  // ── Locate-me ──────────────────────────────────────────────────────────────
  const onLocate = () => {
    if (!position) return;
    cameraRef.current?.setCamera({
      centerCoordinate: [position.lng, position.lat],
      zoomLevel: 15,
      animationDuration: 450,
      animationMode: 'easeTo',
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <MapboxGL.MapView
        style={StyleSheet.absoluteFillObject}
        styleURL={DARK_STYLE}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled={false}
        scaleBarEnabled={false}>

        <MapboxGL.Camera
          ref={cameraRef}
          centerCoordinate={INIT_COORD}
          zoomLevel={2}
          animationMode="none"
        />

        {/* ── Claimed parcels — fill + stroke ─────────────────────────────── */}
        <MapboxGL.ShapeSource
          id="parcels-source"
          shape={parcelsGeoJson}
          onPress={onParcelPress}>
          <MapboxGL.FillLayer
            id="parcels-fill"
            style={{
              fillColor:   ['get', 'color'],
              fillOpacity: 0.15,
            }}
          />
          <MapboxGL.LineLayer
            id="parcels-stroke"
            style={{
              lineColor: ['get', 'color'],
              lineWidth: 2.5,
              lineCap:   'round',
              lineJoin:  'round',
            }}
          />
          {/* Username label centred on each polygon, visible at zoom ≥ 14 */}
          <MapboxGL.SymbolLayer
            id="parcels-labels"
            minZoomLevel={14}
            style={{
              textField:           ['get', 'username'],
              textSize:            12,
              textColor:           '#ffffff',
              textHaloColor:       'rgba(0,0,0,0.7)',
              textHaloWidth:       1.5,
              textFont:            ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
              textAllowOverlap:    false,
              textIgnorePlacement: false,
            }}
          />
        </MapboxGL.ShapeSource>

        {/* ── Live route polyline ──────────────────────────────────────────── */}
        {routeGeoJson && (
          <MapboxGL.ShapeSource id="route-source" shape={routeGeoJson}>
            <MapboxGL.LineLayer
              id="route-line"
              style={{
                lineColor:  AMBER,
                lineWidth:  4,
                lineCap:    'round',
                lineJoin:   'round',
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* ── User position marker ─────────────────────────────────────────── */}
        {position && (
          <MapboxGL.PointAnnotation
            id="user-position"
            coordinate={[position.lng, position.lat]}>
            <View style={styles.markerWrap}>
              <View style={styles.markerPulse} />
              <View style={styles.markerDot} />
            </View>
          </MapboxGL.PointAnnotation>
        )}
      </MapboxGL.MapView>

      {/* ── Locate-me button ──────────────────────────────────────────────── */}
      <View
        pointerEvents="box-none"
        style={[styles.floatControls, { top: insets.top + 16 }]}>
        <Pressable
          onPress={onLocate}
          style={[styles.floatBtn, !position && styles.floatBtnDisabled]}>
          <Text style={styles.floatBtnText}>◎</Text>
        </Pressable>
      </View>

      {/* ── Mapbox attribution (required by ToS) ─────────────────────────── */}
      <Text style={[styles.attribution, { bottom: insets.bottom + 8 }]}>
        © Mapbox © OpenStreetMap
      </Text>

      {/* ── Parcel detail sheet ───────────────────────────────────────────── */}
      <Modal
        visible={selectedParcel !== null}
        transparent
        animationType="slide"
        onRequestClose={() => useParcelStore.getState().setSelectedParcel(null)}>
        {selectedParcel && (
          <ParcelDetailSheet
            parcel={selectedParcel}
            onClose={() => useParcelStore.getState().setSelectedParcel(null)}
          />
        )}
      </Modal>
    </View>
  );
}

// ─── Parcel detail sheet ──────────────────────────────────────────────────────

function ParcelDetailSheet({
  parcel,
  onClose,
}: {
  parcel: Parcel;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable
        onPress={(e) => e.stopPropagation()}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}>

        <View style={styles.sheetHandle} />

        <View style={styles.sheetHeader}>
          <View style={[styles.colorSwatch, { backgroundColor: parcel.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.ownerName}>
              @{parcel.owner_username ?? 'unknown'}
            </Text>
            {parcel.owner_display_name ? (
              <Text style={styles.ownerDisplayName}>{parcel.owner_display_name}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCell label="AREA"    value={formatAreaM2(parcel.area_sqm)} accent />
          <StatCell label="POINTS"  value={String(parcel.points)} />
          <StatCell
            label="CLAIMED"
            value={new Date(parcel.claimed_at).toLocaleDateString(undefined, {
              month: 'short',
              day:   'numeric',
            })}
          />
        </View>

        <View style={styles.sheetActions}>
          <Pressable
            style={[styles.closeBtn, { flex: 1 }]}
            onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </Pressable>
          <Pressable
            style={[styles.viewDetailsBtn, { flex: 1 }]}
            onPress={() => {
              onClose();
              router.push(`/parcel/${parcel.id}`);
            }}>
            <Text style={styles.viewDetailsBtnText}>View Route</Text>
          </Pressable>
        </View>
      </Pressable>
    </Pressable>
  );
}

function StatCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && { color: AMBER }]}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  markerWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerPulse: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: `${AMBER}44`,
  },
  markerDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: AMBER,
  },

  floatControls: {
    position: 'absolute',
    right: 14,
  },
  floatBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(14,14,16,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatBtnDisabled: {
    opacity: 0.4,
  },
  floatBtnText: {
    fontSize: 22,
    color: '#fff',
    lineHeight: 26,
  },

  attribution: {
    position: 'absolute',
    left: 8,
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    fontFamily: FONT_LABEL,
  },

  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
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
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  colorSwatch: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
  ownerName: {
    fontFamily: FONT_DISPLAY,
    fontSize: 26,
    color: '#fff',
    letterSpacing: 0.5,
  },
  ownerDisplayName: {
    fontFamily: FONT_LABEL,
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 16,
  },
  statCell: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontFamily: FONT_LABEL,
    fontSize: 10,
    letterSpacing: 1.8,
    color: 'rgba(255,255,255,0.38)',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  statValue: {
    fontFamily: FONT_LABEL,
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
  },
  closeBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  closeBtnText: {
    fontFamily: FONT_LABEL,
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.5,
  },
  viewDetailsBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(245,197,24,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.3)',
  },
  viewDetailsBtnText: {
    fontFamily: FONT_LABEL,
    fontSize: 15,
    color: '#f5c518',
    letterSpacing: 0.5,
  },
});

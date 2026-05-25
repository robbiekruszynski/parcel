import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';

import { formatAreaM2, formatDistanceM } from '@/lib/parcelGeometry';
import { supabase } from '@/lib/supabase';
import { type Parcel } from '@/stores/parcelStore';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ParcelRow {
  id: string;
  owner_id: string;
  co_owner_id: string | null;
  co_owners: string[] | null;
  group_id: string | null;
  coordinates: [number, number][] | null;
  area_sqm: number | null;
  claimed_at: string;
  color: string | null;
  points: number | null;
  activity: string | null;
  profiles: { username: string | null; display_name: string | null } | null;
  groups: { name: string | null } | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function rowToParcel(row: ParcelRow): Parcel {
  return {
    id:                  row.id,
    owner_id:            row.owner_id,
    co_owner_id:         row.co_owner_id ?? null,
    co_owners:           row.co_owners ?? [],
    group_id:            row.group_id ?? null,
    group_name:          row.groups?.name ?? null,
    coordinates:         row.coordinates ?? [],
    area_sqm:            row.area_sqm ?? 0,
    claimed_at:          row.claimed_at,
    color:               row.color ?? '#f5c518',
    points:              row.points ?? 0,
    activity:            row.activity ?? 'walking',
    owner_username:      row.profiles?.username ?? null,
    owner_display_name:  row.profiles?.display_name ?? null,
  };
}

/** Haversine distance in metres between two [lat, lng] pairs. */
function haversine(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const c =
    sinLat * sinLat +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

function routeDistance(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let d = 0;
  for (let i = 1; i < coords.length; i++) {
    d += haversine(coords[i - 1], coords[i]);
  }
  return d;
}

type ActivityIconName =
  | 'walk'
  | 'run'
  | 'bike'
  | 'rollerblade'
  | 'map-marker-path';

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── Expanded detail row ───────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// ─── Parcel Card ───────────────────────────────────────────────────────────────

function ParcelCard({
  parcel,
  mine,
  expanded,
  onToggle,
}: {
  parcel: Parcel;
  mine: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const username = parcel.owner_username ? `@${parcel.owner_username}` : '@unknown';
  const icon = activityIcon(parcel.activity);
  const distance = routeDistance(parcel.coordinates as [number, number][]);

  return (
    <Pressable
      onPress={onToggle}
      style={[styles.card, mine && styles.cardMine]}>
      {/* Colour swatch */}
      <View style={[styles.swatch, { backgroundColor: parcel.color }]} />

      <View style={styles.cardBody}>
        {/* Top row: @username | activity */}
        <View style={styles.cardRow}>
          <Text
            style={[styles.username, mine && styles.usernameAmber]}
            numberOfLines={1}>
            {username}
          </Text>
          <View style={styles.activityBadge}>
            <MaterialCommunityIcons
              name={icon}
              size={13}
              color="#9ca3af"
              style={{ marginRight: 3 }}
            />
            <Text style={styles.activityText}>{activityLabel(parcel.activity)}</Text>
          </View>
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="rgba(255,255,255,0.3)"
          />
        </View>

        {/* Bottom row: area | pts | date */}
        <View style={styles.cardRow}>
          <Text style={styles.areaText}>{formatAreaM2(parcel.area_sqm)}</Text>
          <Text style={styles.pointsText}>{parcel.points} pts</Text>
          <Text style={styles.dateText}>{formatDate(parcel.claimed_at)}</Text>
        </View>

        {/* Expanded details */}
        {expanded && (
          <View style={styles.expandedSection}>
            <View style={styles.expandedDivider} />
            <DetailRow
              label="CLAIMED AT"
              value={`${formatDate(parcel.claimed_at)} · ${formatTime(parcel.claimed_at)}`}
            />
            <DetailRow
              label="DISTANCE"
              value={distance > 0 ? formatDistanceM(distance) : '—'}
            />
            <DetailRow
              label="AREA"
              value={formatAreaM2(parcel.area_sqm)}
            />
            <DetailRow
              label="ACTIVITY"
              value={activityLabel(parcel.activity)}
            />
            <DetailRow
              label="POINTS"
              value={`${parcel.points} pts (ticking every 5 min)`}
            />
            {parcel.owner_display_name ? (
              <DetailRow label="OWNER" value={parcel.owner_display_name} />
            ) : null}
            {parcel.group_name ? (
              <DetailRow label="GROUP" value={parcel.group_name} />
            ) : null}
            {parcel.co_owners.length > 0 ? (
              <DetailRow
                label={`CO-OWNER${parcel.co_owners.length > 1 ? 'S' : ''}`}
                value={`${parcel.co_owners.length + 1}-way cooperative claim`}
              />
            ) : parcel.co_owner_id ? (
              <DetailRow label="CO-OWNER" value="Cooperative claim" />
            ) : null}

            {/* View route button */}
            <Pressable
              style={styles.viewRouteBtn}
              onPress={() => router.push(`/parcel/${parcel.id}`)}>
              <MaterialCommunityIcons name="map-outline" size={14} color="#f5c518" style={{ marginRight: 6 }} />
              <Text style={styles.viewRouteBtnText}>VIEW ROUTE ON MAP</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{title}</Text>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function TerritoryScreen() {
  const [allParcels, setAllParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: sessionData }, { data, error }] = await Promise.all([
        supabase.auth.getSession(),
        supabase
          .from('parcels')
          .select(
            'id, owner_id, co_owner_id, co_owners, group_id, coordinates, area_sqm, claimed_at, color, points, activity, profiles(username, display_name), groups(name)'
          )
          .not('coordinates', 'is', null)
          .order('claimed_at', { ascending: false })
          .limit(200),
      ]);

      setUserId(sessionData.session?.user?.id ?? null);

      if (error) {
        if (__DEV__) console.warn('[territory] load:', error.message);
      } else {
        const parcels = ((data ?? []) as unknown as ParcelRow[]).map(rowToParcel);
        setAllParcels(parcels);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const myParcels = allParcels.filter((p) => p.owner_id === userId);

  if (loading && allParcels.length === 0) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator color="#f5c518" style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <FlatList
        data={allParcels}
        keyExtractor={(item) => `all-${item.id}`}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void load()}
            tintColor="#f5c518"
          />
        }
        ListHeaderComponent={
          <>
            {/* ── MY PARCELS ── */}
            <SectionHeader title="MY PARCELS" />
            {myParcels.length === 0 ? (
              <Text style={styles.emptyText}>
                No parcels yet — head to the map and start walking.
              </Text>
            ) : (
              myParcels.map((p) => (
                <ParcelCard
                  key={`mine-${p.id}`}
                  parcel={p}
                  mine
                  expanded={expandedId === p.id}
                  onToggle={() => toggle(p.id)}
                />
              ))
            )}

            {/* ── ALL PARCELS ── */}
            <SectionHeader title="ALL PARCELS" />
          </>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No parcels claimed yet.</Text>
        }
        renderItem={({ item }) => (
          <ParcelCard
            parcel={item}
            mine={item.owner_id === userId}
            expanded={expandedId === item.id}
            onToggle={() => toggle(item.id)}
          />
        )}
      />
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const AMBER = '#f5c518';
const BG = '#0e0e10';
const CARD_BG = '#13131a';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },

  // Section header
  sectionHeader: {
    paddingVertical: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  sectionHeaderText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    letterSpacing: 2,
    color: '#6b7280',
    textTransform: 'uppercase',
  },

  // Card
  card: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  cardMine: {
    borderWidth: 1,
    borderColor: AMBER + '55',
  },
  swatch: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Username
  username: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: '#e5e7eb',
    flex: 1,
  },
  usernameAmber: {
    color: AMBER,
  },

  // Activity badge
  activityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 12,
    color: '#9ca3af',
  },

  // Data
  areaText: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 15,
    color: '#f3f4f6',
    flex: 1,
  },
  pointsText: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 13,
    color: AMBER,
  },
  dateText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    color: '#6b7280',
  },

  // Expanded section
  expandedSection: {
    marginTop: 8,
  },
  expandedDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },

  // View route button
  viewRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(245,197,24,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.25)',
  },
  viewRouteBtnText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.5,
    color: '#f5c518',
  },

  // Empty state
  emptyText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 20,
  },
});

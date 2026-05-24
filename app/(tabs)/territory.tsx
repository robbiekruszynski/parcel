import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { formatAreaM2 } from '@/lib/parcelGeometry';
import { supabase } from '@/lib/supabase';
import { type Parcel } from '@/stores/parcelStore';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ParcelRow {
  id: string;
  owner_id: string;
  coordinates: [number, number][] | null;
  area_sqm: number | null;
  claimed_at: string;
  color: string | null;
  points: number | null;
  activity: string | null;
  profiles: { username: string | null; display_name: string | null } | null;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function rowToParcel(row: ParcelRow): Parcel {
  return {
    id: row.id,
    owner_id: row.owner_id,
    coordinates: row.coordinates ?? [],
    area_sqm: row.area_sqm ?? 0,
    claimed_at: row.claimed_at,
    color: row.color ?? '#f5c518',
    points: row.points ?? 0,
    activity: row.activity ?? 'walking',
    owner_username: row.profiles?.username ?? null,
    owner_display_name: row.profiles?.display_name ?? null,
  };
}

type ActivityIconName =
  | 'walk'
  | 'run'
  | 'bike'
  | 'rollerblade'
  | 'map-marker-path';

function activityIcon(activity: string): ActivityIconName {
  switch (activity) {
    case 'walking':      return 'walk';
    case 'running':      return 'run';
    case 'cycling':      return 'bike';
    case 'rollerblading': return 'rollerblade';
    default:             return 'map-marker-path';
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

// ─── Parcel Card ───────────────────────────────────────────────────────────────

function ParcelCard({ parcel, mine }: { parcel: Parcel; mine: boolean }) {
  const username = parcel.owner_username ? `@${parcel.owner_username}` : '@unknown';
  const icon = activityIcon(parcel.activity);

  return (
    <View style={[styles.card, mine && styles.cardMine]}>
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
        </View>

        {/* Bottom row: area | pts | date */}
        <View style={styles.cardRow}>
          <Text style={styles.areaText}>{formatAreaM2(parcel.area_sqm)}</Text>
          <Text style={styles.pointsText}>{parcel.points} pts</Text>
          <Text style={styles.dateText}>{formatDate(parcel.claimed_at)}</Text>
        </View>
      </View>
    </View>
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: sessionData }, { data, error }] = await Promise.all([
        supabase.auth.getSession(),
        supabase
          .from('parcels')
          .select(
            'id, owner_id, coordinates, area_sqm, claimed_at, color, points, activity, profiles(username, display_name)'
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
                <ParcelCard key={`mine-${p.id}`} parcel={p} mine />
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
          <ParcelCard parcel={item} mine={item.owner_id === userId} />
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

  // Empty state
  emptyText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 20,
  },
});

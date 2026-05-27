import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { supabase } from '@/lib/supabase';
import { routeLengthMeters } from '@/lib/parcelGeometry';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParcelHistoryRow {
  id: string;
  claimed_at: string;
  area_sqm: number | null;
  points: number | null;
  activity: string | null;
  coordinates: [number, number][] | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtArea(m2: number | null): string {
  if (m2 == null || m2 === 0) return '—';
  if (m2 < 10_000) return `${Math.round(m2)} m²`;
  return `${(m2 / 10_000).toFixed(2)} ha`;
}

function fmtDistance(m: number): string {
  if (m < 10) return '—';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(2)} km`;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

const ACTIVITY_ICONS: Record<string, string> = {
  walking:      'walk',
  running:      'run',
  cycling:      'bike',
  rollerblading:'roller-skate',
  skating:      'skating',
};

// ─── Row component ────────────────────────────────────────────────────────────

function ParcelRow({ item }: { item: ParcelHistoryRow }) {
  const iconName = ACTIVITY_ICONS[item.activity ?? ''] ?? 'map-marker';

  // Coords are [lat, lng] pairs — convert to {lat, lng} for routeLengthMeters
  const distM = item.coordinates
    ? routeLengthMeters(item.coordinates.map(([lat, lng]) => ({ lat, lng })))
    : 0;

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      onPress={() => router.push(`/parcel/${item.id}` as never)}>

      <View style={styles.rowIcon}>
        <MaterialCommunityIcons
          name={iconName as never}
          size={20}
          color="rgba(255,255,255,0.35)"
        />
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.rowDate}>{fmtDateTime(item.claimed_at)}</Text>
        <View style={styles.rowMeta}>
          <Text style={styles.rowStat}>{fmtArea(item.area_sqm)}</Text>
          <Text style={styles.rowDot}>·</Text>
          <Text style={styles.rowStat}>{fmtDistance(distM)}</Text>
        </View>
      </View>

      <Text style={styles.rowPoints}>+{item.points ?? 0}</Text>
    </Pressable>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function TrackScreen() {
  const [parcels,   setParcels]   = useState<ParcelHistoryRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchParcels = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else           setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) return;

      const { data, error } = await supabase
        .from('parcels')
        .select('id, claimed_at, area_sqm, points, activity, coordinates')
        .eq('owner_id', session.user.id)
        .order('claimed_at', { ascending: false })
        .limit(50);

      if (error) {
        if (__DEV__) console.warn('[TrackScreen] fetchParcels:', error.message);
        return;
      }
      setParcels((data ?? []) as ParcelHistoryRow[]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void fetchParcels();
    }, [fetchParcels]),
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <Text style={styles.heading}>History</Text>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#f5c518" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <Text style={styles.heading}>History</Text>

      <FlatList
        data={parcels}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ParcelRow item={item} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void fetchParcels(true)}
            tintColor="#f5c518"
          />
        }
        contentContainerStyle={parcels.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No parcels yet —{'\n'}go claim some territory
          </Text>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const DARK    = '#0e0e10';
const SURFACE = '#13131a';
const BORDER  = 'rgba(255,255,255,0.07)';
const MUTED   = 'rgba(255,255,255,0.38)';
const AMBER   = '#f5c518';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DARK,
  },
  heading: {
    fontFamily: 'Syne_800ExtraBold',
    fontSize: 26,
    color: '#ffffff',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 80,
  },
  emptyText: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 22,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: DARK,
    gap: 12,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowDate: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: '#ffffff',
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowStat: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 11,
    color: MUTED,
  },
  rowDot: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 11,
    color: MUTED,
  },
  rowPoints: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 16,
    color: AMBER,
    letterSpacing: 0.5,
  },
  separator: {
    height: 1,
    backgroundColor: BORDER,
    marginLeft: 68,
  },
});

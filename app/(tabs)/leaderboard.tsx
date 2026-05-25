/**
 * leaderboard.tsx — Rankings screen
 * Toggle between sorted-by-points and sorted-by-parcel-count.
 * Your own row is highlighted in amber.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaderEntry {
  user_id: string;
  username: string | null;
  display_name: string | null;
  points_total: number;
  parcel_count: number;
}

type SortMode = 'points' | 'parcels';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(entry: LeaderEntry): string {
  const name = entry.display_name ?? entry.username ?? '';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts[0]?.length) return parts[0].slice(0, 2).toUpperCase();
  return '??';
}

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

// ─── Row ──────────────────────────────────────────────────────────────────────

function LeaderRow({
  entry, rank, isMe, sortMode,
}: {
  entry: LeaderEntry; rank: number; isMe: boolean; sortMode: SortMode;
}) {
  return (
    <View style={[styles.row, isMe && styles.rowMe]}>
      <View style={styles.rankCell}>
        {rank <= 3
          ? <Text style={styles.medal}>{MEDAL[rank]}</Text>
          : <Text style={styles.rankNum}>{rank}</Text>}
      </View>

      <View style={[styles.avatar, isMe && styles.avatarMe]}>
        <Text style={[styles.avatarText, isMe && styles.avatarTextMe]}>
          {initials(entry)}
        </Text>
      </View>

      <View style={styles.nameBlock}>
        <Text style={[styles.username, isMe && styles.usernameMe]} numberOfLines={1}>
          @{entry.username ?? 'unknown'}
        </Text>
        {entry.display_name ? (
          <Text style={styles.displayName} numberOfLines={1}>{entry.display_name}</Text>
        ) : null}
      </View>

      <View style={styles.statBlock}>
        <Text style={[styles.statPrimary, isMe && styles.statPrimaryMe]}>
          {sortMode === 'points'
            ? entry.points_total.toLocaleString()
            : entry.parcel_count.toLocaleString()}
        </Text>
        <Text style={styles.statSub}>{sortMode === 'points' ? 'pts' : 'parcels'}</Text>
      </View>

      <View style={styles.statBlock}>
        <Text style={styles.statSecondary}>
          {sortMode === 'points'
            ? entry.parcel_count
            : entry.points_total.toLocaleString()}
        </Text>
        <Text style={styles.statSub}>{sortMode === 'points' ? 'parcels' : 'pts'}</Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const [entries, setEntries] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('points');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: sessionData }, { data: profiles }, { data: parcelRows }] =
        await Promise.all([
          supabase.auth.getSession(),
          supabase.from('profiles').select('id, username, display_name, points_total'),
          supabase.from('parcels').select('owner_id'),
        ]);

      setMyUserId(sessionData.session?.user?.id ?? null);

      if (!profiles) return;

      const countMap: Record<string, number> = {};
      for (const r of parcelRows ?? []) {
        countMap[r.owner_id] = (countMap[r.owner_id] ?? 0) + 1;
      }

      setEntries(
        profiles.map((p) => ({
          user_id: p.id,
          username: p.username,
          display_name: p.display_name,
          points_total: p.points_total ?? 0,
          parcel_count: countMap[p.id] ?? 0,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const sorted = [...entries].sort((a, b) =>
    sortMode === 'points'
      ? b.points_total - a.points_total
      : b.parcel_count - a.parcel_count
  );

  return (
    <SafeAreaView style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>Rankings</Text>
        <View style={styles.toggle}>
          <Pressable
            style={[styles.toggleBtn, sortMode === 'points' && styles.toggleBtnActive]}
            onPress={() => setSortMode('points')}>
            <Text style={[styles.toggleText, sortMode === 'points' && styles.toggleTextActive]}>
              Points
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleBtn, sortMode === 'parcels' && styles.toggleBtnActive]}
            onPress={() => setSortMode('parcels')}>
            <Text style={[styles.toggleText, sortMode === 'parcels' && styles.toggleTextActive]}>
              Parcels
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── Column labels ── */}
      <View style={styles.colHeaders}>
        <Text style={[styles.colHeader, { width: 40 }]}>#</Text>
        <Text style={[styles.colHeader, { flex: 1 }]}>Player</Text>
        <Text style={[styles.colHeader, { width: 76, textAlign: 'right' }]}>
          {sortMode === 'points' ? 'PTS' : 'PARCELS'}
        </Text>
        <Text style={[styles.colHeader, { width: 76, textAlign: 'right' }]}>
          {sortMode === 'points' ? 'PARCELS' : 'PTS'}
        </Text>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(item) => item.user_id}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#f5c518" />
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color="#f5c518" style={{ marginTop: 60 }} />
          ) : (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="trophy-outline" size={48} color="rgba(255,255,255,0.1)" />
              <Text style={styles.emptyText}>No players yet</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <LeaderRow
            entry={item}
            rank={index + 1}
            isMe={item.user_id === myUserId}
            sortMode={sortMode}
          />
        )}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const AMBER = '#f5c518';
const BG    = '#0e0e10';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 30,
    color: '#fff',
    letterSpacing: 0.5,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    padding: 3,
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
  },
  toggleBtnActive: { backgroundColor: AMBER },
  toggleText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  toggleTextActive: { color: '#0e0e10' },

  colHeaders: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  colHeader: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 9,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
  },

  list: { paddingBottom: 100 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  rowMe: {
    backgroundColor: 'rgba(245,197,24,0.06)',
    borderColor: 'rgba(245,197,24,0.12)',
  },

  rankCell: { width: 40, alignItems: 'center' },
  rankNum: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 16,
    color: 'rgba(255,255,255,0.25)',
  },
  medal: { fontSize: 18 },

  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarMe: { backgroundColor: AMBER },
  avatarText: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 15,
  },
  avatarTextMe: { color: '#0e0e10' },

  nameBlock: { flex: 1, marginRight: 4 },
  username: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: '#e5e7eb',
  },
  usernameMe: { color: AMBER },
  displayName: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 1,
  },

  statBlock: { width: 76, alignItems: 'flex-end' },
  statPrimary: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 18,
    color: '#fff',
    lineHeight: 21,
  },
  statPrimaryMe: { color: AMBER },
  statSecondary: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
    lineHeight: 16,
  },
  statSub: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 9,
    color: 'rgba(255,255,255,0.2)',
    letterSpacing: 0.8,
  },

  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
  },
});

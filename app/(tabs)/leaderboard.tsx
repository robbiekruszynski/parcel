/**
 * leaderboard.tsx — Rankings screen
 *
 * Two views:
 *  PLAYERS — individual rankings sorted by pts or parcel count.
 *            Tap any row to open the public PlayerProfileSheet.
 *  GROUPS  — group rankings sorted by the group's communal points pool.
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

import { PlayerProfileSheet } from '@/components/PlayerProfileSheet';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LeaderEntry {
  user_id: string;
  username: string | null;
  display_name: string | null;
  points_total: number;
  parcel_count: number;
}

interface GroupEntry {
  id: string;
  name: string;
  points: number;
  member_count: number;
}

type ViewMode = 'players' | 'groups';
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

// ─── Player row ───────────────────────────────────────────────────────────────

function PlayerRow({
  entry, rank, isMe, sortMode, onPress,
}: {
  entry: LeaderEntry;
  rank: number;
  isMe: boolean;
  sortMode: SortMode;
  onPress: () => void;
}) {
  const primaryValue = sortMode === 'points'
    ? entry.points_total.toLocaleString()
    : entry.parcel_count.toLocaleString();
  const primaryLabel = sortMode === 'points' ? 'pts' : 'parcels';

  const secondaryValue = sortMode === 'points'
    ? entry.parcel_count.toLocaleString()
    : entry.points_total.toLocaleString();
  const secondaryLabel = sortMode === 'points' ? 'parcels' : 'pts';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        isMe && styles.rowMe,
        pressed && styles.rowPressed,
      ]}>
      {/* Rank */}
      <View style={styles.rankCell}>
        {rank <= 3
          ? <Text style={styles.medal}>{MEDAL[rank]}</Text>
          : <Text style={styles.rankNum}>{rank}</Text>}
      </View>

      {/* Avatar */}
      <View style={[styles.avatar, isMe && styles.avatarMe]}>
        <Text style={[styles.avatarTxt, isMe && styles.avatarTxtMe]}>
          {initials(entry)}
        </Text>
      </View>

      {/* Name block */}
      <View style={styles.nameBlock}>
        <Text style={[styles.username, isMe && styles.usernameMe]} numberOfLines={1}>
          @{entry.username ?? 'unknown'}
        </Text>
        {entry.display_name ? (
          <Text style={styles.displayName} numberOfLines={1}>{entry.display_name}</Text>
        ) : null}
      </View>

      {/* Primary stat */}
      <View style={styles.statCol}>
        <Text style={[styles.statValue, isMe && styles.statValueMe]}>{primaryValue}</Text>
        <Text style={styles.statLabel}>{primaryLabel}</Text>
      </View>

      {/* Secondary stat */}
      <View style={[styles.statCol, styles.statColSecondary]}>
        <Text style={styles.statValueDim}>{secondaryValue}</Text>
        <Text style={styles.statLabel}>{secondaryLabel}</Text>
      </View>
    </Pressable>
  );
}

// ─── Group row ────────────────────────────────────────────────────────────────

function GroupRow({ entry, rank }: { entry: GroupEntry; rank: number }) {
  return (
    <View style={styles.row}>
      <View style={styles.rankCell}>
        {rank <= 3
          ? <Text style={styles.medal}>{MEDAL[rank]}</Text>
          : <Text style={styles.rankNum}>{rank}</Text>}
      </View>

      <View style={styles.groupIcon}>
        <MaterialCommunityIcons name="account-group" size={15} color="#a78bfa" />
      </View>

      <View style={styles.nameBlock}>
        <Text style={styles.groupName} numberOfLines={1}>{entry.name}</Text>
        <Text style={styles.groupMeta}>
          {entry.member_count} member{entry.member_count !== 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.statCol}>
        <Text style={[styles.statValue, { color: '#a78bfa' }]}>{entry.points.toLocaleString()}</Text>
        <Text style={styles.statLabel}>pool pts</Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>('players');
  const [sortMode, setSortMode] = useState<SortMode>('points');

  const [entries, setEntries]   = useState<LeaderEntry[]>([]);
  const [groups, setGroups]     = useState<GroupEntry[]>([]);
  const [loading, setLoading]   = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        { data: sessionData },
        { data: profiles },
        { data: parcelRows },
        { data: groupRows },
        { data: memberCountRows },
      ] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from('profiles').select('id, username, display_name, points_total'),
        supabase.from('parcels').select('owner_id'),
        supabase.from('groups').select('id, name, points').order('points', { ascending: false }).limit(100),
        supabase.from('group_members').select('group_id'),
      ]);

      setMyUserId(sessionData.session?.user?.id ?? null);

      const countMap: Record<string, number> = {};
      for (const r of parcelRows ?? []) {
        countMap[r.owner_id] = (countMap[r.owner_id] ?? 0) + 1;
      }
      setEntries(
        (profiles ?? []).map((p) => ({
          user_id:      p.id,
          username:     p.username,
          display_name: p.display_name,
          points_total: p.points_total ?? 0,
          parcel_count: countMap[p.id] ?? 0,
        }))
      );

      const memberMap: Record<string, number> = {};
      for (const r of memberCountRows ?? []) {
        memberMap[r.group_id] = (memberMap[r.group_id] ?? 0) + 1;
      }
      setGroups(
        (groupRows ?? []).map((g) => ({
          id:           g.id,
          name:         g.name,
          points:       g.points ?? 0,
          member_count: memberMap[g.id] ?? 0,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const sortedPlayers = [...entries].sort((a, b) =>
    sortMode === 'points'
      ? b.points_total - a.points_total
      : b.parcel_count - a.parcel_count
  );
  const sortedGroups = [...groups].sort((a, b) => b.points - a.points);

  return (
    <SafeAreaView style={styles.root}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>Rankings</Text>

        {/* Players / Groups toggle */}
        <View style={styles.toggle}>
          <Pressable
            style={[styles.toggleBtn, viewMode === 'players' && styles.toggleBtnActive]}
            onPress={() => setViewMode('players')}>
            <Text style={[styles.toggleTxt, viewMode === 'players' && styles.toggleTxtActive]}>
              Players
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleBtn, viewMode === 'groups' && styles.toggleBtnActive]}
            onPress={() => setViewMode('groups')}>
            <Text style={[styles.toggleTxt, viewMode === 'groups' && styles.toggleTxtActive]}>
              Groups
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── Sort toggle (players only) ── */}
      {viewMode === 'players' && (
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort by</Text>
          <Pressable
            style={[styles.sortChip, sortMode === 'points' && styles.sortChipActive]}
            onPress={() => setSortMode('points')}>
            <Text style={[styles.sortChipTxt, sortMode === 'points' && styles.sortChipTxtActive]}>
              Points
            </Text>
          </Pressable>
          <Pressable
            style={[styles.sortChip, sortMode === 'parcels' && styles.sortChipActive]}
            onPress={() => setSortMode('parcels')}>
            <Text style={[styles.sortChipTxt, sortMode === 'parcels' && styles.sortChipTxtActive]}>
              Parcels
            </Text>
          </Pressable>
        </View>
      )}

      {/* ── Column header ── */}
      <View style={styles.colRow}>
        <View style={styles.rankCell} />
        <View style={styles.avatar} />
        <Text style={[styles.colTxt, { flex: 1 }]}>
          {viewMode === 'players' ? 'PLAYER' : 'GROUP'}
        </Text>
        <Text style={[styles.colTxt, styles.colTxtRight, { width: COL_W }]}>
          {viewMode === 'players'
            ? (sortMode === 'points' ? 'PTS' : 'PARCELS')
            : 'POOL PTS'}
        </Text>
        {viewMode === 'players' && (
          <Text style={[styles.colTxt, styles.colTxtRight, { width: COL_W2 }]}>
            {sortMode === 'points' ? 'PARCELS' : 'PTS'}
          </Text>
        )}
      </View>

      {/* ── Lists ── */}
      {viewMode === 'players' ? (
        <FlatList
          data={sortedPlayers}
          keyExtractor={(item) => item.user_id}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={AMBER} />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            loading
              ? <ActivityIndicator color={AMBER} style={{ marginTop: 60 }} />
              : <EmptyState icon="trophy-outline" text="No players yet" />
          }
          renderItem={({ item, index }) => (
            <PlayerRow
              entry={item}
              rank={index + 1}
              isMe={item.user_id === myUserId}
              sortMode={sortMode}
              onPress={() => setProfileUserId(item.user_id)}
            />
          )}
        />
      ) : (
        <FlatList
          data={sortedGroups}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={AMBER} />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            loading
              ? <ActivityIndicator color={AMBER} style={{ marginTop: 60 }} />
              : <EmptyState icon="account-group-outline" text="No groups yet" />
          }
          renderItem={({ item, index }) => (
            <GroupRow entry={item} rank={index + 1} />
          )}
        />
      )}

      {/* ── Player profile sheet ── */}
      <PlayerProfileSheet
        userId={profileUserId}
        myUserId={myUserId}
        onClose={() => setProfileUserId(null)}
      />
    </SafeAreaView>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  icon, text,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  text: string;
}) {
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon} size={48} color="rgba(255,255,255,0.1)" />
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const AMBER  = '#f5c518';
const BG     = '#0e0e10';

// Column widths — keep in sync between header and rows
const COL_W  = 68;   // primary stat
const COL_W2 = 56;   // secondary stat

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  title: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 30,
    color: '#fff',
    letterSpacing: 0.5,
  },

  // Players/Groups toggle
  toggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 20,
    padding: 3,
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 17,
  },
  toggleBtnActive: { backgroundColor: AMBER },
  toggleTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.45)',
  },
  toggleTxtActive: { color: '#0e0e10', fontWeight: '700' },

  // Sort chips
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  sortLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
  },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sortChipActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  sortChipTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
  },
  sortChipTxtActive: { color: '#fff' },

  // Column header row — mirrors the row layout
  colRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  colTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 9,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
  },
  colTxtRight: { textAlign: 'right' },

  list: { paddingBottom: 100 },

  // ── Row ────────────────────────────────────────────────────────────────────
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  rowMe: {
    backgroundColor: 'rgba(245,197,24,0.06)',
    borderColor: 'rgba(245,197,24,0.1)',
  },
  rowPressed: { backgroundColor: 'rgba(255,255,255,0.04)' },

  // Rank cell
  rankCell: { width: 36, alignItems: 'center' },
  rankNum: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 15,
    color: 'rgba(255,255,255,0.25)',
  },
  medal: { fontSize: 16 },

  // Avatar
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  avatarMe: { backgroundColor: AMBER },
  avatarTxt: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 14,
  },
  avatarTxtMe: { color: '#0e0e10' },

  // Group icon (same size as avatar for column alignment)
  groupIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(167,139,250,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
  },

  // Name block
  nameBlock: {
    flex: 1,
    marginRight: 6,
    minWidth: 0,   // allows text truncation inside flex
  },
  username: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: '#e5e7eb',
    lineHeight: 17,
  },
  usernameMe: { color: AMBER },
  displayName: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 14,
  },
  groupName: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 15,
    color: '#fff',
    lineHeight: 18,
  },
  groupMeta: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 14,
  },

  // Stat columns — fixed width, right-aligned
  statCol: {
    width: COL_W,
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  statColSecondary: {
    width: COL_W2,
  },
  statValue: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 18,
    color: '#ffffff',
    lineHeight: 21,
  },
  statValueMe: { color: AMBER },
  statValueDim: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 15,
    color: 'rgba(255,255,255,0.3)',
    lineHeight: 18,
  },
  statLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 9,
    color: 'rgba(255,255,255,0.22)',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },

  // Empty state
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
  },
});

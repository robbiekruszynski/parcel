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
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        isMe && styles.rowMe,
        pressed && styles.rowPressed,
      ]}
      onPress={onPress}>
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
            ? entry.parcel_count.toLocaleString()
            : entry.points_total.toLocaleString()}
        </Text>
        <Text style={styles.statSub}>{sortMode === 'points' ? 'parcels' : 'pts'}</Text>
      </View>

      <MaterialCommunityIcons
        name="chevron-right"
        size={14}
        color="rgba(255,255,255,0.15)"
        style={{ marginLeft: 2 }}
      />
    </Pressable>
  );
}

// ─── Group row ────────────────────────────────────────────────────────────────

function GroupRow({ entry, rank }: { entry: GroupEntry; rank: number }) {
  return (
    <View style={[styles.row, styles.groupRow]}>
      <View style={styles.rankCell}>
        {rank <= 3
          ? <Text style={styles.medal}>{MEDAL[rank]}</Text>
          : <Text style={styles.rankNum}>{rank}</Text>}
      </View>

      <View style={styles.groupIcon}>
        <MaterialCommunityIcons name="account-group" size={16} color="#a78bfa" />
      </View>

      <View style={styles.nameBlock}>
        <Text style={styles.groupName} numberOfLines={1}>{entry.name}</Text>
        <Text style={styles.groupMeta}>
          {entry.member_count} member{entry.member_count !== 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.statBlock}>
        <Text style={styles.groupPts}>{entry.points.toLocaleString()}</Text>
        <Text style={styles.statSub}>pool pts</Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LeaderboardScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>('players');
  const [sortMode, setSortMode] = useState<SortMode>('points');

  const [entries, setEntries]     = useState<LeaderEntry[]>([]);
  const [groups, setGroups]       = useState<GroupEntry[]>([]);
  const [loading, setLoading]     = useState(false);
  const [myUserId, setMyUserId]   = useState<string | null>(null);

  // Profile sheet
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

      // ── Players ──
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

      // ── Groups ──
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
        <View style={styles.viewToggle}>
          <Pressable
            style={[styles.viewBtn, viewMode === 'players' && styles.viewBtnActive]}
            onPress={() => setViewMode('players')}>
            <MaterialCommunityIcons
              name="account"
              size={13}
              color={viewMode === 'players' ? '#0e0e10' : 'rgba(255,255,255,0.45)'}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.viewBtnText, viewMode === 'players' && styles.viewBtnTextActive]}>
              Players
            </Text>
          </Pressable>
          <Pressable
            style={[styles.viewBtn, viewMode === 'groups' && styles.viewBtnActive]}
            onPress={() => setViewMode('groups')}>
            <MaterialCommunityIcons
              name="account-group"
              size={13}
              color={viewMode === 'groups' ? '#0e0e10' : 'rgba(255,255,255,0.45)'}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.viewBtnText, viewMode === 'groups' && styles.viewBtnTextActive]}>
              Groups
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── Player sort toggle ── */}
      {viewMode === 'players' && (
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort by</Text>
          <View style={styles.sortToggle}>
            <Pressable
              style={[styles.sortBtn, sortMode === 'points' && styles.sortBtnActive]}
              onPress={() => setSortMode('points')}>
              <Text style={[styles.sortBtnText, sortMode === 'points' && styles.sortBtnTextActive]}>
                Points
              </Text>
            </Pressable>
            <Pressable
              style={[styles.sortBtn, sortMode === 'parcels' && styles.sortBtnActive]}
              onPress={() => setSortMode('parcels')}>
              <Text style={[styles.sortBtnText, sortMode === 'parcels' && styles.sortBtnTextActive]}>
                Parcels
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Group hint ── */}
      {viewMode === 'groups' && (
        <View style={styles.groupHint}>
          <MaterialCommunityIcons name="information-outline" size={12} color="rgba(255,255,255,0.25)" />
          <Text style={styles.groupHintText}>
            Group pool points — earned from member contributions
          </Text>
        </View>
      )}

      {/* ── Column labels ── */}
      <View style={styles.colHeaders}>
        <Text style={[styles.colHeader, { width: 40 }]}>#</Text>
        <Text style={[styles.colHeader, { flex: 1 }]}>
          {viewMode === 'players' ? 'Player' : 'Group'}
        </Text>
        <Text style={[styles.colHeader, { width: 80, textAlign: 'right', marginRight: 16 }]}>
          {viewMode === 'players'
            ? (sortMode === 'points' ? 'PTS' : 'PARCELS')
            : 'POOL PTS'}
        </Text>
        {viewMode === 'players' && (
          <Text style={[styles.colHeader, { width: 76, textAlign: 'right' }]}>
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
            <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#f5c518" />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            loading
              ? <ActivityIndicator color="#f5c518" style={{ marginTop: 60 }} />
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
            <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#f5c518" />
          }
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            loading
              ? <ActivityIndicator color="#f5c518" style={{ marginTop: 60 }} />
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

  // View mode toggle (Players | Groups)
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 20,
    padding: 3,
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  viewBtnActive: { backgroundColor: AMBER },
  viewBtnText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
  },
  viewBtnTextActive: { color: '#0e0e10' },

  // Sort toggle (Points | Parcels)
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  sortLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
  },
  sortToggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    padding: 2,
  },
  sortBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
  },
  sortBtnActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  sortBtnText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  sortBtnTextActive: { color: '#fff' },

  // Group hint
  groupHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  groupHintText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
  },

  // Column headers
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

  // Player row
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
  rowPressed: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  groupRow: {
    borderColor: 'rgba(255,255,255,0.04)',
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

  groupIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(167,139,250,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.2)',
  },

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
  groupName: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 16,
    color: '#fff',
    letterSpacing: 0.2,
  },
  groupMeta: {
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
  groupPts: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 18,
    color: '#a78bfa',
    lineHeight: 21,
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

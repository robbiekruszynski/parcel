/**
 * group.tsx — Groups screen
 *
 * - Shows groups you belong to
 * - Create a new group (just a name)
 * - Invite someone by exact @username
 * - Tap a group to expand members + their parcel counts + points
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PlayerProfileSheet } from '@/components/PlayerProfileSheet';
import { supabase } from '@/lib/supabase';

if (Platform.OS === 'android') {
  const { UIManager } = require('react-native');
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface GroupMember {
  user_id: string;
  username: string | null;
  display_name: string | null;
  points_total: number;
  parcel_count: number;
  role: string;
  contribution_pct: number;
}

interface Group {
  id: string;
  name: string;
  invite_code: string | null;
  created_by: string;
  pool_points: number;
  members: GroupMember[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function avatarInitials(name: string | null, username: string | null): string {
  const n = name ?? username ?? '';
  const parts = n.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts[0]?.length) return parts[0].slice(0, 2).toUpperCase();
  return '??';
}

// ─── Member row ───────────────────────────────────────────────────────────────

function MemberRow({
  member, isMe, onPress, onContributionChange,
}: {
  member: GroupMember;
  isMe: boolean;
  onPress: () => void;
  onContributionChange?: (delta: number) => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.memberRow, isMe && styles.memberRowMe, pressed && { opacity: 0.75 }]}
      onPress={onPress}>
      <View style={[styles.memberAvatar, isMe && styles.memberAvatarMe]}>
        <Text style={[styles.memberAvatarText, isMe && styles.memberAvatarTextMe]}>
          {avatarInitials(member.display_name, member.username)}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.memberName, isMe && styles.memberNameMe]} numberOfLines={1}>
          @{member.username ?? 'unknown'}
          {member.role === 'admin' ? '  👑' : ''}
        </Text>
        {member.display_name ? (
          <Text style={styles.memberDisplayName} numberOfLines={1}>{member.display_name}</Text>
        ) : null}
        {/* Contribution stepper — only visible on your own row */}
        {isMe && onContributionChange && (
          <View style={styles.contributionRow}>
            <Text style={styles.contributionLabel}>
              Giving {member.contribution_pct}% to group
            </Text>
            <Pressable
              style={styles.stepBtn}
              onPress={(e) => { e.stopPropagation(); onContributionChange(-5); }}
              disabled={member.contribution_pct <= 0}>
              <Text style={[styles.stepTxt, member.contribution_pct <= 0 && { opacity: 0.3 }]}>−</Text>
            </Pressable>
            <Pressable
              style={styles.stepBtn}
              onPress={(e) => { e.stopPropagation(); onContributionChange(+5); }}
              disabled={member.contribution_pct >= 100}>
              <Text style={[styles.stepTxt, member.contribution_pct >= 100 && { opacity: 0.3 }]}>+</Text>
            </Pressable>
          </View>
        )}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.memberPts, isMe && { color: AMBER }]}>
          {member.points_total.toLocaleString()} pts
        </Text>
        <Text style={styles.memberParcels}>{member.parcel_count} parcels</Text>
      </View>
    </Pressable>
  );
}

// ─── Group card ───────────────────────────────────────────────────────────────

function GroupCard({
  group,
  myUserId,
  expanded,
  onToggle,
  onInvite,
  onLeave,
  onMemberPress,
  onContributionChange,
}: {
  group: Group;
  myUserId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onInvite: (groupId: string) => void;
  onLeave: (groupId: string, groupName: string) => void;
  onMemberPress: (userId: string) => void;
  onContributionChange: (groupId: string, userId: string, delta: number) => void;
}) {
  const totalParcels = group.members.reduce((s, m) => s + m.parcel_count, 0);

  return (
    <View style={styles.groupCard}>
      <Pressable style={styles.groupHeader} onPress={onToggle}>
        <View style={{ flex: 1 }}>
          <Text style={styles.groupName}>{group.name}</Text>
          <Text style={styles.groupMeta}>
            {group.members.length} member{group.members.length !== 1 ? 's' : ''} · {totalParcels} parcels
          </Text>
        </View>
        {/* Group pool points — highlighted separately */}
        <View style={styles.poolBadge}>
          <Text style={styles.poolPts}>{group.pool_points.toLocaleString()}</Text>
          <Text style={styles.poolLabel}>pool pts</Text>
        </View>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color="rgba(255,255,255,0.3)"
          style={{ marginLeft: 8 }}
        />
      </Pressable>

      {expanded && (
        <View style={styles.groupExpanded}>
          <View style={styles.expandedDivider} />

          {group.members.map((m) => (
            <MemberRow
              key={m.user_id}
              member={m}
              isMe={m.user_id === myUserId}
              onPress={() => onMemberPress(m.user_id)}
              onContributionChange={
                m.user_id === myUserId
                  ? (delta) => onContributionChange(group.id, m.user_id, delta)
                  : undefined
              }
            />
          ))}

          {/* Actions */}
          <View style={styles.groupActions}>
            <Pressable style={styles.actionBtn} onPress={() => onInvite(group.id)}>
              <FontAwesome name="user-plus" size={13} color="#f5c518" style={{ marginRight: 6 }} />
              <Text style={styles.actionBtnText}>Invite</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.actionBtnDanger]}
              onPress={() => onLeave(group.id, group.name)}>
              <FontAwesome name="sign-out" size={13} color="#ef4444" style={{ marginRight: 6 }} />
              <Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Leave</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function GroupScreen() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Modals
  const [createVisible, setCreateVisible] = useState(false);
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [busy, setBusy] = useState(false);

  // Player profile sheet
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id ?? null;
      setMyUserId(uid);
      if (!uid) return;

      // Groups I'm in
      const { data: memberRows } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('user_id', uid);

      if (!memberRows?.length) { setGroups([]); return; }

      const groupIds = memberRows.map((r) => r.group_id);

      // Group details (include pool_points)
      const { data: groupRows } = await supabase
        .from('groups')
        .select('id, name, invite_code, created_by, points')
        .in('id', groupIds);

      if (!groupRows) { setGroups([]); return; }

      // All members of those groups with profile data + contribution_pct
      const { data: allMembers } = await supabase
        .from('group_members')
        .select('group_id, user_id, role, contribution_pct, profiles(username, display_name, points_total)')
        .in('group_id', groupIds);

      // Parcel counts per user
      const { data: parcelRows } = await supabase
        .from('parcels')
        .select('owner_id');

      const parcelCount: Record<string, number> = {};
      for (const p of parcelRows ?? []) {
        parcelCount[p.owner_id] = (parcelCount[p.owner_id] ?? 0) + 1;
      }

      const built: Group[] = groupRows.map((g) => ({
        id:          g.id,
        name:        g.name,
        invite_code: g.invite_code,
        created_by:  g.created_by,
        pool_points: g.points ?? 0,
        members: (allMembers ?? [])
          .filter((m) => m.group_id === g.id)
          .map((m) => {
            const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
            return {
              user_id:          m.user_id,
              username:         profile?.username ?? null,
              display_name:     profile?.display_name ?? null,
              points_total:     profile?.points_total ?? 0,
              parcel_count:     parcelCount[m.user_id] ?? 0,
              role:             m.role ?? 'member',
              contribution_pct: m.contribution_pct ?? 20,
            };
          }),
      }));

      setGroups(built);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const toggle = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // ── Create group ──────────────────────────────────────────────────────────
  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) { Alert.alert('Enter a group name'); return; }
    if (!myUserId) return;
    setBusy(true);
    try {
      // Enforce 3-group limit
      const { count } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', myUserId);

      if ((count ?? 0) >= 3) {
        Alert.alert(
          'Group limit reached',
          'You can be in up to 3 groups at a time. Leave a group to create a new one.'
        );
        setBusy(false);
        return;
      }

      // Generate a unique 6-char invite code
      const invite_code = Math.random().toString(36).substring(2, 8).toUpperCase();

      const { data: g, error } = await supabase
        .from('groups')
        .insert({ name, created_by: myUserId, invite_code })
        .select('id')
        .single();
      if (error || !g) throw new Error(error?.message ?? 'Failed to create group');

      await supabase
        .from('group_members')
        .insert({ group_id: g.id, user_id: myUserId, role: 'admin' });

      setCreateName('');
      setCreateVisible(false);
      await load();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not create group');
    } finally {
      setBusy(false);
    }
  };

  // ── Invite by username ────────────────────────────────────────────────────
  const handleInvite = async () => {
    const uname = inviteUsername.trim().replace(/^@/, '').toLowerCase();
    if (!uname || !inviteGroupId) return;
    setBusy(true);
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', uname)
        .single();

      if (error || !profile) throw new Error(`@${uname} not found`);

      // Check not already a member
      const { data: existing } = await supabase
        .from('group_members')
        .select('user_id')
        .eq('group_id', inviteGroupId)
        .eq('user_id', profile.id)
        .maybeSingle();

      if (existing) throw new Error(`@${uname} is already in this group`);

      await supabase
        .from('group_members')
        .insert({ group_id: inviteGroupId, user_id: profile.id, role: 'member' });

      setInviteUsername('');
      setInviteGroupId(null);
      await load();
      Alert.alert('Done', `@${uname} has been added to the group`);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not add member');
    } finally {
      setBusy(false);
    }
  };

  // ── Contribution % change ─────────────────────────────────────────────────
  const handleContributionChange = async (groupId: string, userId: string, delta: number) => {
    // Optimistic update
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          members: g.members.map((m) => {
            if (m.user_id !== userId) return m;
            const next = Math.max(0, Math.min(100, m.contribution_pct + delta));
            return { ...m, contribution_pct: next };
          }),
        };
      })
    );

    // Find new value after update
    const group = groups.find((g) => g.id === groupId);
    const member = group?.members.find((m) => m.user_id === userId);
    if (!member) return;
    const newPct = Math.max(0, Math.min(100, member.contribution_pct + delta));

    await supabase
      .from('group_members')
      .update({ contribution_pct: newPct })
      .eq('group_id', groupId)
      .eq('user_id', userId);
  };

  // ── Leave group ───────────────────────────────────────────────────────────
  const handleLeave = (groupId: string, groupName: string) => {
    Alert.alert(`Leave ${groupName}?`, 'You can rejoin later if someone invites you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await supabase
            .from('group_members')
            .delete()
            .eq('group_id', groupId)
            .eq('user_id', myUserId!);
          await load();
        },
      },
    ]);
  };

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Groups</Text>
        <Pressable style={styles.createBtn} onPress={() => setCreateVisible(true)}>
          <FontAwesome name="plus" size={12} color="#0e0e10" style={{ marginRight: 6 }} />
          <Text style={styles.createBtnText}>New Group</Text>
        </Pressable>
      </View>

      <FlatList
        data={groups}
        keyExtractor={(g) => g.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor="#f5c518" />
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color="#f5c518" style={{ marginTop: 60 }} />
          ) : (
            <View style={styles.empty}>
              <MaterialCommunityIcons name="account-group-outline" size={56} color="rgba(255,255,255,0.1)" />
              <Text style={styles.emptyTitle}>No groups yet</Text>
              <Text style={styles.emptySubtitle}>
                Create a group and invite friends by their @username
              </Text>
              <Pressable style={styles.emptyCreateBtn} onPress={() => setCreateVisible(true)}>
                <Text style={styles.emptyCreateBtnText}>Create your first group</Text>
              </Pressable>
            </View>
          )
        }
        renderItem={({ item }) => (
          <GroupCard
            group={item}
            myUserId={myUserId}
            expanded={expandedId === item.id}
            onToggle={() => toggle(item.id)}
            onInvite={(id) => { setInviteGroupId(id); setInviteUsername(''); }}
            onLeave={handleLeave}
            onMemberPress={(uid) => setProfileUserId(uid)}
            onContributionChange={handleContributionChange}
          />
        )}
      />

      {/* ── Create group modal ─────────────────────────────────────────────── */}
      <Modal visible={createVisible} transparent animationType="slide" onRequestClose={() => setCreateVisible(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={[styles.modalBackdrop, StyleSheet.absoluteFillObject]} onPress={() => setCreateVisible(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Create Group</Text>
            <TextInput
              style={styles.input}
              placeholder="Group name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={createName}
              onChangeText={setCreateName}
              autoFocus
              editable={!busy}
            />
            <Pressable style={[styles.modalBtn, busy && { opacity: 0.5 }]} onPress={() => void handleCreate()} disabled={busy}>
              {busy ? <ActivityIndicator color="#0e0e10" /> : <Text style={styles.modalBtnText}>Create</Text>}
            </Pressable>
          </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Player profile sheet ──────────────────────────────────────────── */}
      <PlayerProfileSheet
        userId={profileUserId}
        myUserId={myUserId}
        onClose={() => setProfileUserId(null)}
      />

      {/* ── Invite modal ───────────────────────────────────────────────────── */}
      <Modal visible={!!inviteGroupId} transparent animationType="slide" onRequestClose={() => setInviteGroupId(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Pressable style={[styles.modalBackdrop, StyleSheet.absoluteFillObject]} onPress={() => setInviteGroupId(null)} />
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.modalTitle}>Invite by Username</Text>
            <TextInput
              style={styles.input}
              placeholder="@username"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={inviteUsername}
              onChangeText={setInviteUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              editable={!busy}
            />
            <Pressable style={[styles.modalBtn, busy && { opacity: 0.5 }]} onPress={() => void handleInvite()} disabled={busy}>
              {busy ? <ActivityIndicator color="#0e0e10" /> : <Text style={styles.modalBtnText}>Add to Group</Text>}
            </Pressable>
          </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const AMBER   = '#f5c518';
const BG      = '#0e0e10';
const CARD_BG = '#13131a';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  title: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 30,
    color: '#fff',
    letterSpacing: 0.5,
  },
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AMBER,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  createBtnText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: '#0e0e10',
  },

  list: { paddingHorizontal: 16, paddingBottom: 100 },

  // Group card
  groupCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  groupName: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 20,
    color: '#fff',
    letterSpacing: 0.3,
  },
  groupMeta: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  // Pool points badge
  poolBadge: {
    alignItems: 'flex-end',
  },
  poolPts: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 18,
    color: '#a78bfa',
    lineHeight: 21,
  },
  poolLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 9,
    letterSpacing: 1,
    color: 'rgba(167,139,250,0.5)',
  },

  groupExpanded: { paddingHorizontal: 16, paddingBottom: 14 },
  expandedDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 12,
  },

  // Member row
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  memberRowMe: {
    backgroundColor: 'rgba(245,197,24,0.05)',
    borderRadius: 8,
    paddingHorizontal: 6,
    marginHorizontal: -6,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarMe: { backgroundColor: AMBER },
  memberAvatarText: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 14,
  },
  memberAvatarTextMe: { color: '#0e0e10' },
  memberName: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: '#e5e7eb',
  },
  memberNameMe: { color: AMBER },
  memberDisplayName: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
  },
  // Contribution % stepper
  contributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  contributionLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    color: 'rgba(245,197,24,0.65)',
    flex: 1,
  },
  stepBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  stepTxt: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 14,
    color: '#fff',
    lineHeight: 17,
  },

  memberPts: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
  },
  memberParcels: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },

  // Group actions
  groupActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: 'rgba(245,197,24,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.2)',
  },
  actionBtnDanger: {
    backgroundColor: 'rgba(239,68,68,0.07)',
    borderColor: 'rgba(239,68,68,0.2)',
  },
  actionBtnText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: AMBER,
  },

  // Empty state
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 10 },
  emptyTitle: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 22,
    color: 'rgba(255,255,255,0.4)',
  },
  emptySubtitle: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyCreateBtn: {
    marginTop: 8,
    backgroundColor: AMBER,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  emptyCreateBtnText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: '#0e0e10',
  },

  // Modals
  modalBackdrop: {
    position: 'absolute',
    top: -800,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
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
  modalTitle: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 22,
    color: '#fff',
    marginBottom: 16,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#fff',
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 15,
    marginBottom: 14,
  },
  modalBtn: {
    backgroundColor: AMBER,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalBtnText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 15,
    color: '#0e0e10',
    fontWeight: '700',
  },
});

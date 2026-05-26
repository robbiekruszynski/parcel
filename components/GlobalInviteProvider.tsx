/**
 * GlobalInviteProvider.tsx
 *
 * Mounted ONCE at the root layout level (inside AuthProvider).
 *
 * Subscribes to two real-time channels:
 *  1. pair_requests  — INSERT where to_user_id = me
 *  2. group_invites  — INSERT where to_user_id = me
 *
 * Shows bottom-sheet modals for accept / decline.
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { supabase } from '@/lib/supabase';
import { usePairStore } from '@/stores/pairStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IncomingGroupInvite {
  id: string;
  groupId: string;
  groupName: string;
  fromUsername: string | null;
  inviteCode: string | null;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function GlobalInviteProvider() {
  const myUserIdRef = useRef<string | null>(null);

  const incomingPair  = usePairStore((s) => s.incomingRequest);
  const [groupInvite, setGroupInvite] = useState<IncomingGroupInvite | null>(null);
  const [groupCodeInput, setGroupCodeInput] = useState('');
  const [pairBusy,  setPairBusy]  = useState(false);
  const [groupBusy, setGroupBusy] = useState(false);

  const hydrateGroupInvite = async (row: {
    id: string;
    group_id: string;
    group_name: string;
    from_user_id: string;
  }) => {
    const [{ data: profile }, { data: group }] = await Promise.all([
      supabase.from('profiles').select('username').eq('id', row.from_user_id).single(),
      supabase.from('groups').select('invite_code').eq('id', row.group_id).single(),
    ]);

    setGroupCodeInput('');
    setGroupInvite({
      id:           row.id,
      groupId:      row.group_id,
      groupName:    row.group_name,
      fromUsername: profile?.username ?? null,
      inviteCode:   group?.invite_code ?? null,
    });
  };

  // ── Load current user ID once ─────────────────────────────────────────────
  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      myUserIdRef.current = session?.user?.id ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_ev, session) => {
      myUserIdRef.current = session?.user?.id ?? null;
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load pending group invites on mount (cold start) ─────────────────────
  useEffect(() => {
    const loadPending = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id;
      if (!uid) return;

      const { data: rows } = await supabase
        .from('group_invites')
        .select('id, group_id, group_name, from_user_id, expires_at, status')
        .eq('to_user_id', uid)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1);

      const row = rows?.[0];
      if (row) await hydrateGroupInvite(row);
    };

    void loadPending();
  }, []);

  // ── Pair requests — global subscription ──────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('global-pair-requests')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pair_requests' },
        async (payload) => {
          const row = payload.new as {
            id: string;
            from_user_id: string;
            to_user_id: string;
            expires_at: string;
          };
          if (!row.id || !row.from_user_id) return;
          if (row.to_user_id !== myUserIdRef.current) return;
          if (row.expires_at && new Date(row.expires_at) < new Date()) return;

          const { data: profile } = await supabase
            .from('profiles')
            .select('username')
            .eq('id', row.from_user_id)
            .single();

          usePairStore.getState().setIncomingRequest({
            id:           row.id,
            fromUserId:   row.from_user_id,
            fromUsername: profile?.username ?? null,
          });
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, []);

  // ── Group invites — global subscription ──────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('global-group-invites')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'group_invites' },
        async (payload) => {
          const row = payload.new as {
            id: string;
            group_id: string;
            group_name: string;
            from_user_id: string;
            to_user_id: string;
            expires_at: string;
            status: string;
          };
          if (!row.id) return;
          if (row.to_user_id !== myUserIdRef.current) return;
          if (row.status !== 'pending') return;
          if (row.expires_at && new Date(row.expires_at) < new Date()) return;

          await hydrateGroupInvite(row);
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, []);

  // ── Pair request — accept / decline ──────────────────────────────────────

  const acceptPair = async () => {
    if (!incomingPair) return;
    setPairBusy(true);
    try {
      const { error } = await supabase
        .from('pair_requests')
        .update({ status: 'accepted' })
        .eq('id', incomingPair.id);
      if (error) throw new Error(error.message);
      usePairStore.getState().addPartner({
        id:       incomingPair.fromUserId,
        username: incomingPair.fromUsername,
      });
      usePairStore.getState().setIncomingRequest(null);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not accept');
    } finally {
      setPairBusy(false);
    }
  };

  const declinePair = async () => {
    if (!incomingPair) return;
    await supabase
      .from('pair_requests')
      .update({ status: 'declined' })
      .eq('id', incomingPair.id);
    usePairStore.getState().setIncomingRequest(null);
  };

  // ── Group invite — accept / decline ──────────────────────────────────────

  const acceptGroupInvite = async () => {
    if (!groupInvite || !myUserIdRef.current) return;

    const entered = groupCodeInput.trim().toUpperCase();
    if (entered.length !== 6) {
      Alert.alert('Enter invite code', 'Type the 6-character code shared with you.');
      return;
    }
    if (groupInvite.inviteCode && entered !== groupInvite.inviteCode.toUpperCase()) {
      Alert.alert('Wrong code', 'That invite code does not match this group.');
      return;
    }

    setGroupBusy(true);
    try {
      const { count } = await supabase
        .from('group_members')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', myUserIdRef.current);
      if ((count ?? 0) >= 3) {
        throw new Error('You can be in up to 3 groups at a time. Leave a group first.');
      }

      const [updateRes, insertRes] = await Promise.all([
        supabase
          .from('group_invites')
          .update({ status: 'accepted' })
          .eq('id', groupInvite.id),
        supabase
          .from('group_members')
          .insert({ group_id: groupInvite.groupId, user_id: myUserIdRef.current, role: 'member' }),
      ]);
      if (updateRes.error) throw new Error(updateRes.error.message);
      if (insertRes.error && !insertRes.error.message.includes('duplicate')) {
        throw new Error(insertRes.error.message);
      }
      setGroupInvite(null);
      setGroupCodeInput('');
      Alert.alert('Joined!', `You're now a member of ${groupInvite.groupName}.`);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not accept invite');
    } finally {
      setGroupBusy(false);
    }
  };

  const declineGroupInvite = async () => {
    if (!groupInvite) return;
    await supabase
      .from('group_invites')
      .update({ status: 'declined' })
      .eq('id', groupInvite.id);
    setGroupInvite(null);
    setGroupCodeInput('');
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Incoming pair request ── */}
      <Modal
        visible={incomingPair !== null}
        transparent
        animationType="slide"
        onRequestClose={() => void declinePair()}>
        {incomingPair ? (
          <InviteSheet
            icon="account-multiple-plus"
            iconColor="#63dc96"
            title="Pair Request"
            body={
              `@${incomingPair.fromUsername ?? 'someone'} wants to walk with you — ` +
              `points on the next claimed parcel will be split equally.`
            }
            highlightWord={`@${incomingPair.fromUsername ?? 'someone'}`}
            acceptLabel="Accept"
            acceptColor="#63dc96"
            busy={pairBusy}
            onAccept={() => void acceptPair()}
            onDecline={() => void declinePair()}
          />
        ) : null}
      </Modal>

      {/* ── Incoming group invite ── */}
      <Modal
        visible={groupInvite !== null}
        transparent
        animationType="slide"
        onRequestClose={() => void declineGroupInvite()}>
        {groupInvite ? (
          <GroupInviteSheet
            groupName={groupInvite.groupName}
            fromUsername={groupInvite.fromUsername}
            code={groupCodeInput}
            onCodeChange={(t) => setGroupCodeInput(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            busy={groupBusy}
            onJoin={() => void acceptGroupInvite()}
            onDecline={() => void declineGroupInvite()}
          />
        ) : null}
      </Modal>
    </>
  );
}

// ─── Group invite sheet (code entry + JOIN / DECLINE) ────────────────────────

function GroupInviteSheet({
  groupName,
  fromUsername,
  code,
  onCodeChange,
  busy,
  onJoin,
  onDecline,
}: {
  groupName: string;
  fromUsername: string | null;
  code: string;
  onCodeChange: (value: string) => void;
  busy: boolean;
  onJoin: () => void;
  onDecline: () => void;
}) {
  return (
    <View style={s.backdrop}>
      <View style={s.sheet}>
        <View style={s.handle} />

        <MaterialCommunityIcons
          name="account-group"
          size={40}
          color="#a78bfa"
          style={{ alignSelf: 'center', marginBottom: 14 }}
        />

        <Text style={s.title}>Group Invite</Text>
        <Text style={s.body}>
          <Text style={[s.highlight, { color: '#a78bfa' }]}>
            @{fromUsername ?? 'someone'}
          </Text>
          {` invited you to join "${groupName}". Enter the 6-character invite code to join.`}
        </Text>

        <TextInput
          style={s.codeInput}
          placeholder="ABC123"
          placeholderTextColor="rgba(255,255,255,0.25)"
          value={code}
          onChangeText={onCodeChange}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          editable={!busy}
          onSubmitEditing={onJoin}
        />

        <View style={s.btnRow}>
          <Pressable
            style={[s.btn, s.btnDecline]}
            onPress={onDecline}
            disabled={busy}>
            <Text style={s.btnDeclineTxt}>Decline</Text>
          </Pressable>

          <Pressable
            style={[s.btn, { backgroundColor: '#a78bfa' }, busy && { opacity: 0.6 }]}
            onPress={onJoin}
            disabled={busy || code.length !== 6}>
            {busy
              ? <ActivityIndicator color="#0e0e10" size="small" />
              : <Text style={s.btnAcceptTxt}>Join</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Shared invite bottom sheet ───────────────────────────────────────────────

function InviteSheet({
  icon,
  iconColor,
  title,
  body,
  highlightWord,
  acceptLabel,
  acceptColor,
  busy,
  onAccept,
  onDecline,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  iconColor: string;
  title: string;
  body: string;
  highlightWord: string;
  acceptLabel: string;
  acceptColor: string;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const idx = body.indexOf(highlightWord);
  const before = idx >= 0 ? body.slice(0, idx) : body;
  const after  = idx >= 0 ? body.slice(idx + highlightWord.length) : '';

  return (
    <View style={s.backdrop}>
      <View style={s.sheet}>
        <View style={s.handle} />

        <MaterialCommunityIcons
          name={icon}
          size={40}
          color={iconColor}
          style={{ alignSelf: 'center', marginBottom: 14 }}
        />

        <Text style={s.title}>{title}</Text>

        <Text style={s.body}>
          {idx >= 0 ? (
            <>
              {before}
              <Text style={[s.highlight, { color: iconColor }]}>{highlightWord}</Text>
              {after}
            </>
          ) : body}
        </Text>

        <View style={s.btnRow}>
          <Pressable
            style={[s.btn, s.btnDecline]}
            onPress={onDecline}
            disabled={busy}>
            <Text style={s.btnDeclineTxt}>Decline</Text>
          </Pressable>

          <Pressable
            style={[s.btn, { backgroundColor: acceptColor }, busy && { opacity: 0.6 }]}
            onPress={onAccept}
            disabled={busy}>
            {busy
              ? <ActivityIndicator color="#0e0e10" size="small" />
              : <Text style={s.btnAcceptTxt}>{acceptLabel}</Text>}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: '#13131a',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 44,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 26,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 0.5,
  },
  body: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  highlight: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontWeight: '700',
  },
  codeInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontFamily: 'Rajdhani_700Bold',
    fontSize: 22,
    letterSpacing: 6,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 24,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDecline: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  btnDeclineTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  btnAcceptTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 15,
    color: '#0e0e10',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

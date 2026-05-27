/**
 * GlobalInviteProvider.tsx
 *
 * Mounted ONCE at the root layout level (inside AuthProvider).
 *
 * Subscribes to:
 *  1. pair_requests  — INSERT where to_user_id = me
 *  2. group_invites  — INSERT where to_user_id = me
 *  3. Deep links     — parcel://join?code=XXXXXX
 *  4. Persisted pending group joins (AsyncStorage) — survives backgrounding
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  acceptGroupMembership,
  buildGroupJoinDeepLink,
  declineGroupInvite,
  fetchGroupJoinPreview,
  lookupGroupByCode,
  parseGroupJoinDeepLink,
} from '@/lib/groupJoin';
import { notifyPendingGroupJoin } from '@/lib/groupInviteNotify';
import { supabase } from '@/lib/supabase';
import {
  useGroupJoinStore,
  type PendingGroupJoin,
} from '@/stores/groupJoinStore';
import { usePairStore } from '@/stores/pairStore';

// ─── Provider ────────────────────────────────────────────────────────────────

export function GlobalInviteProvider() {
  const myUserIdRef = useRef<string | null>(null);

  const incomingPair  = usePairStore((s) => s.incomingRequest);
  const pendingJoin   = useGroupJoinStore((s) => s.pending);
  const hydrateJoin   = useGroupJoinStore((s) => s.hydrate);
  const setPendingJoin = useGroupJoinStore((s) => s.setPending);

  const [pairBusy, setPairBusy] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);

  const queuePendingJoin = async (pending: PendingGroupJoin) => {
    await setPendingJoin(pending);
    await notifyPendingGroupJoin(pending.groupName, pending.inviteCode ?? undefined);
  };

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

    const preview = await fetchGroupJoinPreview(row.group_id);
    await queuePendingJoin({
      groupId:         row.group_id,
      groupName:       row.group_name,
      inviteCode:      preview.invite_code,
      source:          'username_invite',
      inviteId:        row.id,
      fromUsername:    profile?.username ?? null,
      creatorUsername: preview.creatorUsername,
      memberCount:     preview.memberCount,
    });
  };

  const handleJoinUrl = async (url: string | null) => {
    if (!url) return;
    const code = parseGroupJoinDeepLink(url);
    if (!code) return;

    const uid = myUserIdRef.current;
    if (!uid) return;

    try {
      const group = await lookupGroupByCode(code);
      await queuePendingJoin({
        groupId:         group.id,
        groupName:       group.name,
        inviteCode:      group.invite_code,
        source:          'deep_link',
        creatorUsername: group.creatorUsername,
        memberCount:     group.memberCount,
      });
    } catch (e: unknown) {
      Alert.alert('Invalid invite', e instanceof Error ? e.message : 'Could not load group.');
    }
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

  // ── Persisted pending join + cold-start deep link ─────────────────────────
  useEffect(() => {
    void hydrateJoin();
    void Linking.getInitialURL().then((url) => void handleJoinUrl(url));

    const sub = Linking.addEventListener('url', ({ url }) => {
      void handleJoinUrl(url);
    });

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void hydrateJoin();
    });

    return () => {
      sub.remove();
      appSub.remove();
    };
  }, [hydrateJoin]);

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
      .channel(`global-pair-requests-${Date.now()}`)
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
      .channel(`global-group-invites-${Date.now()}`)
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

  // ── Group join — accept / decline ─────────────────────────────────────────

  const acceptGroupJoin = async () => {
    if (!pendingJoin) return;
    const uid = myUserIdRef.current;
    if (!uid) return;

    setJoinBusy(true);
    try {
      await acceptGroupMembership(uid, pendingJoin.groupId, pendingJoin.inviteId);
      await setPendingJoin(null);
      Alert.alert('Joined!', `Welcome to ${pendingJoin.groupName}!`);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not join group');
    } finally {
      setJoinBusy(false);
    }
  };

  const declineGroupJoin = async () => {
    if (!pendingJoin) return;
    if (pendingJoin.inviteId) {
      await declineGroupInvite(pendingJoin.inviteId);
    }
    await setPendingJoin(null);
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

      {/* ── Pending group join (passcode, deep link, or username invite) ── */}
      <Modal
        visible={pendingJoin !== null}
        transparent
        animationType="slide"
        onRequestClose={() => void declineGroupJoin()}>
        {pendingJoin ? (
          <PendingGroupJoinSheet
            pending={pendingJoin}
            busy={joinBusy}
            onAccept={() => void acceptGroupJoin()}
            onDecline={() => void declineGroupJoin()}
          />
        ) : null}
      </Modal>
    </>
  );
}

// ─── Pending group join confirmation ──────────────────────────────────────────

function PendingGroupJoinSheet({
  pending,
  busy,
  onAccept,
  onDecline,
}: {
  pending: PendingGroupJoin;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!pending.inviteCode) return;
    await Clipboard.setStringAsync(pending.inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = () => {
    if (!pending.inviteCode) return;
    const link = buildGroupJoinDeepLink(pending.inviteCode);
    void Share.share({
      message:
        `Join "${pending.groupName}" on Parcel!\n` +
        `Code: ${pending.inviteCode}\n` +
        `Open: ${link}`,
    });
  };

  const subtitle =
    pending.source === 'username_invite' && pending.fromUsername
      ? `@${pending.fromUsername} invited you to join this group.`
      : pending.source === 'deep_link'
        ? 'You opened a group invite link.'
        : 'You entered a group invite code.';

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

        <Text style={s.title}>Join Group?</Text>
        <Text style={s.body}>
          {subtitle}
          {'\n\n'}
          <Text style={[s.highlight, { color: '#fff' }]}>{pending.groupName}</Text>
          {pending.creatorUsername ? (
            <>
              {'\n'}
              <Text style={{ color: 'rgba(255,255,255,0.45)' }}>
                Created by @{pending.creatorUsername}
              </Text>
            </>
          ) : null}
          {pending.memberCount != null ? (
            <>
              {'\n'}
              <Text style={{ color: 'rgba(255,255,255,0.45)' }}>
                {pending.memberCount} member{pending.memberCount === 1 ? '' : 's'}
              </Text>
            </>
          ) : null}
        </Text>

        {pending.inviteCode ? (
          <View style={s.codeBox}>
            <Text style={s.codeLabel}>INVITE CODE</Text>
            <Text style={s.codeValue}>{pending.inviteCode}</Text>
            <View style={s.codeActions}>
              <Pressable
                style={[s.copyBtn, copied && s.copyBtnSuccess]}
                onPress={() => void handleCopy()}>
                <MaterialCommunityIcons
                  name={copied ? 'check' : 'content-copy'}
                  size={14}
                  color={copied ? '#0e0e10' : '#a78bfa'}
                  style={{ marginRight: 6 }}
                />
                <Text style={[s.copyBtnTxt, copied && { color: '#0e0e10' }]}>
                  {copied ? 'Copied!' : 'Copy'}
                </Text>
              </Pressable>
              <Pressable style={s.shareBtn} onPress={handleShare}>
                <MaterialCommunityIcons
                  name="share-variant"
                  size={14}
                  color="rgba(255,255,255,0.5)"
                  style={{ marginRight: 6 }}
                />
                <Text style={s.shareBtnTxt}>Share</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <View style={s.btnRow}>
          <Pressable
            style={[s.btn, s.btnDecline]}
            onPress={onDecline}
            disabled={busy}>
            <Text style={s.btnDeclineTxt}>Decline</Text>
          </Pressable>

          <Pressable
            style={[s.btn, { backgroundColor: '#a78bfa' }, busy && { opacity: 0.6 }]}
            onPress={onAccept}
            disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#0e0e10" size="small" />
            ) : (
              <Text style={s.btnAcceptTxt}>Confirm</Text>
            )}
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
  codeBox: {
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  codeLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 10,
    letterSpacing: 2,
    color: 'rgba(167,139,250,0.6)',
    marginBottom: 8,
  },
  codeValue: {
    fontFamily: 'Rajdhani_700Bold',
    fontSize: 38,
    letterSpacing: 10,
    color: '#fff',
    marginBottom: 16,
  },
  codeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
  },
  copyBtnSuccess: {
    backgroundColor: '#a78bfa',
    borderColor: '#a78bfa',
  },
  copyBtnTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: '#a78bfa',
    fontWeight: '700',
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  shareBtnTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
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

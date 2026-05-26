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
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
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
  const [pairBusy, setPairBusy] = useState(false);

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

  // ── Group invite — dismiss (user joins via Groups → Join tab) ────────────
  const dismissGroupInvite = () => {
    setGroupInvite(null);
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
        onRequestClose={dismissGroupInvite}>
        {groupInvite ? (
          <GroupInviteSheet
            groupName={groupInvite.groupName}
            fromUsername={groupInvite.fromUsername}
            inviteCode={groupInvite.inviteCode}
            onDismiss={dismissGroupInvite}
          />
        ) : null}
      </Modal>
    </>
  );
}

// ─── Group invite sheet — shows code prominently, user copies it then joins ───

function GroupInviteSheet({
  groupName,
  fromUsername,
  inviteCode,
  onDismiss,
}: {
  groupName: string;
  fromUsername: string | null;
  inviteCode: string | null;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = () => {
    if (!inviteCode) return;
    void Share.share({
      message: `Join "${groupName}" on Parcel! Invite code: ${inviteCode}`,
    });
  };

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
          {` invited you to join `}
          <Text style={[s.highlight, { color: '#fff' }]}>{groupName}</Text>
        </Text>

        {/* Code display */}
        {inviteCode ? (
          <View style={s.codeBox}>
            <Text style={s.codeLabel}>YOUR INVITE CODE</Text>
            <Text style={s.codeValue}>{inviteCode}</Text>
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
                  {copied ? 'Copied!' : 'Copy Code'}
                </Text>
              </Pressable>
              <Pressable style={s.shareBtn} onPress={handleShare}>
                <MaterialCommunityIcons name="share-variant" size={14} color="rgba(255,255,255,0.5)" style={{ marginRight: 6 }} />
                <Text style={s.shareBtnTxt}>Share</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        <Text style={s.joinHint}>
          Go to <Text style={{ color: '#fff', fontWeight: '700' }}>Groups → Join</Text> and enter this code
        </Text>

        <Pressable style={[s.btn, s.btnDismiss]} onPress={onDismiss}>
          <Text style={s.btnDismissTxt}>Got it</Text>
        </Pressable>
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
  // Code display box
  codeBox: {
    backgroundColor: 'rgba(167,139,250,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.25)',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 14,
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
  joinHint: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 19,
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
  btnDismiss: {
    backgroundColor: '#a78bfa',
  },
  btnDeclineTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  btnDismissTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 15,
    color: '#0e0e10',
    fontWeight: '700',
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

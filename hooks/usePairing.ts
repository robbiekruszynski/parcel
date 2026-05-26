/**
 * usePairing.ts
 *
 * Cooperative-pairing logic supporting unlimited partners.
 *  - Realtime on pair_requests:
 *    INSERT where to_user_id = me  → show incoming request modal
 *    UPDATE where from_user_id = me → accepted adds partner, declined removes pending
 *  - sendPairRequest(username)  — look up + insert, add to pendingInvites
 *  - acceptRequest(id)          — mark accepted, add sender as partner
 *  - declineRequest(id)         — mark declined, clear incomingRequest
 *  - cancelInvite(requestId)    — sender cancels a pending invite
 */

import { useCallback, useEffect, useRef } from 'react';

import { supabase } from '@/lib/supabase';
import { usePairStore } from '@/stores/pairStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PairRequestRow {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  expires_at: string;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function usePairing() {
  const myUserIdRef = useRef<string | null>(null);

  // Fetch current user once
  useEffect(() => {
    void supabase.auth.getSession().then(({ data: { session } }) => {
      myUserIdRef.current = session?.user?.id ?? null;
    });
  }, []);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const handleInsert = async (payload: { new: Partial<PairRequestRow> }) => {
      const row = payload.new;
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
    };

    const handleUpdate = async (payload: { new: Partial<PairRequestRow> }) => {
      const row = payload.new;
      if (!row.id) return;

      // My outgoing invite was accepted
      if (row.from_user_id === myUserIdRef.current && row.status === 'accepted') {
        const pending = usePairStore.getState().pendingInvites.find((i) => i.requestId === row.id);
        usePairStore.getState().addPartner({
          id:       row.to_user_id!,
          username: pending?.toUsername ?? null,
        });
      }

      // My outgoing invite was declined → remove from pending
      if (row.from_user_id === myUserIdRef.current && row.status === 'declined') {
        usePairStore.getState().removePendingInvite(row.id);
      }
    };

    const channel = supabase
      .channel(`pair-requests-mine-${Date.now()}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pair_requests' }, handleInsert)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pair_requests' }, handleUpdate)
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, []);

  // ── sendPairRequest ────────────────────────────────────────────────────────
  const sendPairRequest = useCallback(async (username: string): Promise<void> => {
    const myId = myUserIdRef.current;
    if (!myId) throw new Error('Not signed in');

    const clean = username.replace(/^@/, '').trim();
    if (!clean) throw new Error('Enter a valid username');

    const { data: profile, error: lookupErr } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('username', clean)
      .single();

    if (lookupErr || !profile) throw new Error(`@${clean} not found`);
    if (profile.id === myId) throw new Error("You can't pair with yourself");

    // Already a confirmed partner?
    if (usePairStore.getState().partners.some((p) => p.id === profile.id)) {
      throw new Error(`@${clean} is already in your group`);
    }
    // Already pending?
    if (usePairStore.getState().pendingInvites.some((i) => i.toUserId === profile.id)) {
      throw new Error(`Request already sent to @${clean}`);
    }

    const { data: req, error: insertErr } = await supabase
      .from('pair_requests')
      .insert({ from_user_id: myId, to_user_id: profile.id, status: 'pending' })
      .select('id')
      .single();

    if (insertErr || !req) throw new Error(insertErr?.message ?? 'Failed to send request');

    usePairStore.getState().addPendingInvite({
      requestId:  req.id,
      toUserId:   profile.id,
      toUsername: profile.username ?? clean,
    });

    // Auto-expire after 2 minutes
    setTimeout(() => {
      usePairStore.getState().removePendingInvite(req.id);
    }, 120_000);
  }, []);

  // ── acceptRequest ──────────────────────────────────────────────────────────
  const acceptRequest = useCallback(async (requestId: string): Promise<void> => {
    const { error } = await supabase
      .from('pair_requests')
      .update({ status: 'accepted' })
      .eq('id', requestId);
    if (error) throw new Error(error.message);

    const req = usePairStore.getState().incomingRequest;
    if (req) {
      usePairStore.getState().addPartner({ id: req.fromUserId, username: req.fromUsername });
    }
    usePairStore.getState().setIncomingRequest(null);
  }, []);

  // ── declineRequest ─────────────────────────────────────────────────────────
  const declineRequest = useCallback(async (requestId: string): Promise<void> => {
    await supabase
      .from('pair_requests')
      .update({ status: 'declined' })
      .eq('id', requestId);
    usePairStore.getState().setIncomingRequest(null);
  }, []);

  // ── cancelInvite ───────────────────────────────────────────────────────────
  const cancelInvite = useCallback(async (requestId: string): Promise<void> => {
    await supabase
      .from('pair_requests')
      .update({ status: 'declined' })
      .eq('id', requestId);
    usePairStore.getState().removePendingInvite(requestId);
  }, []);

  return { sendPairRequest, acceptRequest, declineRequest, cancelInvite };
}

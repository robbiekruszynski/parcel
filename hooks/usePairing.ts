/**
 * usePairing.ts
 *
 * Cooperative-pairing logic:
 *  - Realtime subscription on pair_requests table
 *    → incoming INSERT where to_user_id = me  → show request modal
 *    → incoming UPDATE where from_user_id = me → react to accepted / declined
 *  - sendPairRequest(username) — search profiles, insert pair_request row
 *  - acceptRequest(id)         — mark accepted, set pairedUser in store
 *  - declineRequest(id)        — mark declined, clear incomingRequest
 *  - cancelOutgoing()          — sender gives up waiting
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

  // ── Fetch current user on mount ───────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      myUserIdRef.current = session?.user?.id ?? null;
    })();
  }, []);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const handleInsert = async (payload: { new: Partial<PairRequestRow> }) => {
      const row = payload.new;
      if (!row.id || !row.from_user_id) return;
      if (row.to_user_id !== myUserIdRef.current) return;

      // Check it hasn't already expired
      if (row.expires_at && new Date(row.expires_at) < new Date()) return;

      // Fetch sender's username
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
      if (!row.id || row.from_user_id !== myUserIdRef.current) return;

      if (row.status === 'accepted') {
        // Find out the accepting user's username
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', row.to_user_id)
          .single();

        const toUsername = usePairStore.getState().outgoingRequest?.toUsername
          ?? profile?.username
          ?? null;

        usePairStore.getState().setPairedUser(row.to_user_id!, toUsername);
      } else if (row.status === 'declined') {
        usePairStore.getState().setOutgoingRequest(null);
      }
    };

    const channel = supabase
      .channel('pair-requests-mine')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'pair_requests' },
        handleInsert
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pair_requests' },
        handleUpdate
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, []);

  // ── sendPairRequest ────────────────────────────────────────────────────────
  const sendPairRequest = useCallback(async (username: string): Promise<void> => {
    const myId = myUserIdRef.current;
    if (!myId) throw new Error('Not signed in');

    const cleanUsername = username.replace(/^@/, '').trim();
    if (!cleanUsername) throw new Error('Enter a valid username');

    // Look up recipient
    const { data: profile, error: lookupErr } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('username', cleanUsername)
      .single();

    if (lookupErr || !profile) throw new Error(`@${cleanUsername} not found`);
    if (profile.id === myId) throw new Error("You can't pair with yourself");

    // Insert pair_request
    const { data: req, error: insertErr } = await supabase
      .from('pair_requests')
      .insert({
        from_user_id: myId,
        to_user_id:   profile.id,
        status:       'pending',
      })
      .select('id')
      .single();

    if (insertErr || !req) throw new Error(insertErr?.message ?? 'Failed to send request');

    usePairStore.getState().setOutgoingRequest({
      id:         req.id,
      toUserId:   profile.id,
      toUsername: profile.username ?? cleanUsername,
    });

    // Auto-expire after 2 minutes if still pending
    setTimeout(() => {
      const { outgoingRequest } = usePairStore.getState();
      if (outgoingRequest?.id === req.id) {
        usePairStore.getState().setOutgoingRequest(null);
      }
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
      usePairStore.getState().setPairedUser(req.fromUserId, req.fromUsername);
    }
  }, []);

  // ── declineRequest ─────────────────────────────────────────────────────────
  const declineRequest = useCallback(async (requestId: string): Promise<void> => {
    await supabase
      .from('pair_requests')
      .update({ status: 'declined' })
      .eq('id', requestId);

    usePairStore.getState().setIncomingRequest(null);
  }, []);

  // ── cancelOutgoing ─────────────────────────────────────────────────────────
  const cancelOutgoing = useCallback(async (): Promise<void> => {
    const req = usePairStore.getState().outgoingRequest;
    if (!req) return;
    await supabase
      .from('pair_requests')
      .update({ status: 'declined' })
      .eq('id', req.id);
    usePairStore.getState().setOutgoingRequest(null);
  }, []);

  return { sendPairRequest, acceptRequest, declineRequest, cancelOutgoing };
}

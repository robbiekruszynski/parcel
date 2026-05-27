/**
 * pairStore.ts
 *
 * Manages cooperative-walk pairing state.
 * Supports unlimited partners — points are split equally among all.
 */

import { create } from 'zustand';

import { syncPartnerToActiveSession } from '@/lib/syncPartnerToSession';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Partner {
  id: string;
  username: string | null;
}

export interface IncomingPairRequest {
  id: string;
  fromUserId: string;
  fromUsername: string | null;
}

export interface PendingInvite {
  requestId: string;
  toUserId: string;
  toUsername: string;
}

interface PairState {
  /** Confirmed partners (accepted the request). */
  partners: Partner[];
  /** Outgoing invites still waiting on a response. */
  pendingInvites: PendingInvite[];
  /** Incoming request we haven't responded to yet. */
  incomingRequest: IncomingPairRequest | null;

  addPartner:         (partner: Partner) => void;
  removePartner:      (id: string) => void;
  addPendingInvite:   (invite: PendingInvite) => void;
  removePendingInvite:(requestId: string) => void;
  setIncomingRequest: (req: IncomingPairRequest | null) => void;
  clearPairing:       () => void;
  /** Drop confirmed partners but keep pending/outgoing invites. */
  leaveParty:         () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePairStore = create<PairState>((set) => ({
  partners:        [],
  pendingInvites:  [],
  incomingRequest: null,

  addPartner: (partner) => {
    set((s) => ({
      partners: s.partners.some((p) => p.id === partner.id)
        ? s.partners
        : [...s.partners, partner],
      pendingInvites: s.pendingInvites.filter((i) => i.toUserId !== partner.id),
    }));
    void syncPartnerToActiveSession(partner.id);
  },

  removePartner: (id) =>
    set((s) => ({ partners: s.partners.filter((p) => p.id !== id) })),

  addPendingInvite: (invite) =>
    set((s) => ({ pendingInvites: [...s.pendingInvites, invite] })),

  removePendingInvite: (requestId) =>
    set((s) => ({ pendingInvites: s.pendingInvites.filter((i) => i.requestId !== requestId) })),

  setIncomingRequest: (incomingRequest) => set({ incomingRequest }),

  clearPairing: () =>
    set({ partners: [], pendingInvites: [], incomingRequest: null }),

  leaveParty: () => set({ partners: [] }),
}));

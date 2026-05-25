/**
 * pairStore.ts
 *
 * Manages the cooperative-pairing handshake state.
 *
 *  - outgoingRequest  — we sent a request, waiting for the other user to accept
 *  - incomingRequest  — we received a request, waiting for our decision
 *  - pairedUserId     — handshake complete; next CLAIM will be a co-claim
 */

import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IncomingPairRequest {
  id: string;
  fromUserId: string;
  fromUsername: string | null;
}

export interface OutgoingPairRequest {
  id: string;
  toUserId: string;
  toUsername: string;
}

interface PairState {
  pairedUserId:    string | null;
  pairedUsername:  string | null;
  incomingRequest: IncomingPairRequest | null;
  outgoingRequest: OutgoingPairRequest | null;

  setPairedUser:       (userId: string, username: string | null) => void;
  setIncomingRequest:  (req: IncomingPairRequest | null) => void;
  setOutgoingRequest:  (req: OutgoingPairRequest | null) => void;
  clearPairing:        () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const usePairStore = create<PairState>((set) => ({
  pairedUserId:    null,
  pairedUsername:  null,
  incomingRequest: null,
  outgoingRequest: null,

  setPairedUser: (pairedUserId, pairedUsername) =>
    set({ pairedUserId, pairedUsername, outgoingRequest: null, incomingRequest: null }),

  setIncomingRequest: (incomingRequest) => set({ incomingRequest }),

  setOutgoingRequest: (outgoingRequest) => set({ outgoingRequest }),

  clearPairing: () =>
    set({ pairedUserId: null, pairedUsername: null, incomingRequest: null, outgoingRequest: null }),
}));

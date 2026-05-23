import { create } from 'zustand';

import type { StravaAthlete, StravaTokens } from '@/lib/strava';

interface StravaState {
  isConnected: boolean;
  athlete: StravaAthlete | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  /** Which parcel user the current Strava state belongs to (null = cleared). */
  syncedUserId: string | null;
  syncReady: boolean;
  setStravaTokens: (tokens: StravaTokens, userId: string) => void;
  disconnectStrava: () => void;
  setSyncReady: (ready: boolean) => void;
  isTokenExpired: () => boolean;
}

export const useStravaStore = create<StravaState>()((set, get) => ({
  isConnected: false,
  athlete: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  syncedUserId: null,
  syncReady: false,

  setStravaTokens: (tokens, userId) =>
    set({
      isConnected: true,
      athlete: tokens.athlete,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
      syncedUserId: userId,
      syncReady: true,
    }),

  disconnectStrava: () =>
    set({
      isConnected: false,
      athlete: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      syncedUserId: null,
      syncReady: true,
    }),

  setSyncReady: (ready) => set({ syncReady: ready }),

  isTokenExpired: () => {
    const { expiresAt } = get();
    if (!expiresAt) return true;
    return Date.now() / 1000 >= expiresAt - 300;
  },
}));

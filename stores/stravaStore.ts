import { create } from 'zustand';

import type { StravaAthlete, StravaTokens } from '@/lib/strava';
import type { Coord } from '@/stores/locationStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export type StravaUploadStatus = 'idle' | 'uploading' | 'success' | 'failed';

interface StravaState {
  isConnected: boolean;
  athlete: StravaAthlete | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  /** Which parcel user the current Strava state belongs to (null = cleared). */
  syncedUserId: string | null;
  /** True once the initial DB sync has completed (on app launch / auth change). */
  syncReady: boolean;

  // ── Upload status ──────────────────────────────────────────────────────────
  /** Current state of the background Strava upload. */
  uploadStatus: StravaUploadStatus;
  /** Human-readable error shown in the toast when status === 'failed'. */
  uploadError: string | null;
  /** Stored so the toast can trigger a retry without re-wiring the hook. */
  lastRoute: Coord[] | null;
  lastActivityType: string | null;
  lastParcelsClaimed: number;

  // ── Actions ────────────────────────────────────────────────────────────────
  setStravaTokens: (tokens: StravaTokens, userId: string) => void;
  disconnectStrava: () => void;
  setSyncReady: (ready: boolean) => void;
  isTokenExpired: () => boolean;
  setUploadStatus: (status: StravaUploadStatus, error?: string) => void;
  setLastUpload: (route: Coord[], activityType: string, parcelsClaimed: number) => void;
  clearUploadStatus: () => void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useStravaStore = create<StravaState>()((set, get) => ({
  isConnected:       false,
  athlete:           null,
  accessToken:       null,
  refreshToken:      null,
  expiresAt:         null,
  syncedUserId:      null,
  syncReady:         false,

  uploadStatus:      'idle',
  uploadError:       null,
  lastRoute:         null,
  lastActivityType:  null,
  lastParcelsClaimed: 0,

  // ── Auth ───────────────────────────────────────────────────────────────────

  setStravaTokens: (tokens, userId) =>
    set({
      isConnected:  true,
      athlete:      tokens.athlete,
      accessToken:  tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt:    tokens.expires_at,
      syncedUserId: userId,
      syncReady:    true,
    }),

  disconnectStrava: () =>
    set({
      isConnected:  false,
      athlete:      null,
      accessToken:  null,
      refreshToken: null,
      expiresAt:    null,
      syncedUserId: null,
      syncReady:    true,
      uploadStatus: 'idle',
      uploadError:  null,
    }),

  setSyncReady: (ready) => set({ syncReady: ready }),

  isTokenExpired: () => {
    const { expiresAt } = get();
    if (!expiresAt) return true;
    return Date.now() / 1000 >= expiresAt - 300; // 5-min buffer
  },

  // ── Upload status ──────────────────────────────────────────────────────────

  setUploadStatus: (status, error = undefined) =>
    set({ uploadStatus: status, uploadError: error ?? null }),

  setLastUpload: (route, activityType, parcelsClaimed) =>
    set({ lastRoute: route, lastActivityType: activityType, lastParcelsClaimed: parcelsClaimed }),

  clearUploadStatus: () =>
    set({ uploadStatus: 'idle', uploadError: null }),
}));

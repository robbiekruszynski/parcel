import { create } from 'zustand';

import type { LatLng } from '@/lib/geo';

export type Activity =
  | 'walking'
  | 'running'
  | 'cycling'
  | 'skating'
  | 'rollerblading';

type SessionStatus = 'idle' | 'paused' | 'tracking';

function newSessionId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface SessionState {
  /** Fresh UUID per recording session — scopes loop/claim checks. */
  sessionId: string | null;
  activity: Activity | null;
  status: SessionStatus;
  path: LatLng[];
  startedAt: number | null;
  /** True after a parcel is claimed this session — prevents false re-loop. */
  hasClaimedParcel: boolean;
  setActivity: (activity: Activity) => void;
  startSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  endSession: () => void;
  appendCoordinate: (coord: LatLng) => void;
  resetPath: () => void;
  /** Call at the start of every new recording session (not only on app mount). */
  resetSession: (activity?: Activity) => void;
  setHasClaimedParcel: (claimed: boolean) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessionId: null,
  activity: null,
  status: 'idle',
  path: [],
  startedAt: null,
  hasClaimedParcel: false,

  setActivity: (activity) => set({ activity }),

  resetSession: (activity) =>
    set({
      sessionId: newSessionId(),
      activity: activity ?? get().activity,
      status: 'idle',
      path: [],
      startedAt: null,
      hasClaimedParcel: false,
    }),

  setHasClaimedParcel: (hasClaimedParcel) => set({ hasClaimedParcel }),

  startSession: () =>
    set((s) => ({
      status: 'tracking',
      startedAt: Date.now(),
      path: [],
      sessionId: s.sessionId ?? newSessionId(),
      hasClaimedParcel: false,
    })),

  pauseSession: () => set({ status: 'paused' }),
  resumeSession: () => set({ status: 'tracking' }),

  endSession: () =>
    set({
      status: 'idle',
      startedAt: null,
      path: [],
      activity: null,
      sessionId: null,
      hasClaimedParcel: false,
    }),

  appendCoordinate: (coord) =>
    set({ path: [...get().path, coord] }),

  resetPath: () => set({ path: [] }),
}));

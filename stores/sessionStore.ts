import { create } from 'zustand';

import type { LatLng } from '@/lib/geo';

export type Activity =
  | 'walking'
  | 'running'
  | 'cycling'
  | 'skating'
  | 'rollerblading';

type SessionStatus = 'idle' | 'paused' | 'tracking';

interface SessionState {
  activity: Activity | null;
  status: SessionStatus;
  path: LatLng[];
  startedAt: number | null;
  setActivity: (activity: Activity) => void;
  startSession: () => void;
  pauseSession: () => void;
  resumeSession: () => void;
  endSession: () => void;
  appendCoordinate: (coord: LatLng) => void;
  resetPath: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  activity: null,
  status: 'idle',
  path: [],
  startedAt: null,
  setActivity: (activity) => set({ activity }),
  startSession: () =>
    set({
      status: 'tracking',
      startedAt: Date.now(),
      path: [],
    }),
  pauseSession: () => set({ status: 'paused' }),
  resumeSession: () => set({ status: 'tracking' }),
  endSession: () =>
    set({
      status: 'idle',
      startedAt: null,
      path: [],
      activity: null,
    }),
  appendCoordinate: (coord) =>
    set({ path: [...get().path, coord] }),
  resetPath: () => set({ path: [] }),
}));

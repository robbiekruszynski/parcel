import { create } from 'zustand';

/** A single GPS point. `ts` is Unix epoch ms — captured when the point is
 *  appended during tracking. Required for GPX export to Strava. */
export type Coord = { lat: number; lng: number; ts?: number };

interface LocationState {
  position: Coord | null;
  route: Coord[];
  otherPlayers: Record<string, Coord>;
  isTracking: boolean;
  /** GPS watch paused; route retained; no Supabase inserts until resume. */
  isPaused: boolean;
  activeTerritory: Coord[] | null;
  /** ISO timestamp set when a session starts — used to rebuild route from DB. */
  sessionStartedAt: string | null;
  setPosition: (coord: Coord | null) => void;
  appendRoute: (coord: Coord) => void;
  /** Replace the full route array (used when reconstructing from DB). */
  setRoute: (coords: Coord[]) => void;
  setOtherPlayers: (players: Record<string, Coord>) => void;
  setIsTracking: (v: boolean) => void;
  setIsPaused: (v: boolean) => void;
  setActiveTerritory: (coords: Coord[] | null) => void;
  setSessionStartedAt: (iso: string | null) => void;
  resetRoute: () => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  position: null,
  route: [],
  otherPlayers: {},
  isTracking: false,
  isPaused: false,
  activeTerritory: null,
  sessionStartedAt: null,
  setPosition: (coord) => set({ position: coord }),
  appendRoute: (coord) =>
    set((s) => ({
      route: [...s.route, { ...coord, ts: coord.ts ?? Date.now() }],
    })),
  setRoute: (coords) => set({ route: coords }),
  setOtherPlayers: (players) => set({ otherPlayers: players }),
  setIsTracking: (isTracking) => set({ isTracking }),
  setIsPaused: (isPaused) => set({ isPaused }),
  setActiveTerritory: (activeTerritory) => set({ activeTerritory }),
  setSessionStartedAt: (sessionStartedAt) => set({ sessionStartedAt }),
  resetRoute: () => set({ route: [], activeTerritory: null, isPaused: false }),
}));

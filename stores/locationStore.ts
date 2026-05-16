import { create } from 'zustand';

export type Coord = { lat: number; lng: number };

interface LocationState {
  position: Coord | null;
  route: Coord[];
  otherPlayers: Record<string, Coord>;
  isTracking: boolean;
  /** GPS watch paused; route retained; no Supabase inserts until resume. */
  isPaused: boolean;
  activeTerritory: Coord[] | null;
  setPosition: (coord: Coord | null) => void;
  appendRoute: (coord: Coord) => void;
  setOtherPlayers: (players: Record<string, Coord>) => void;
  setIsTracking: (v: boolean) => void;
  setIsPaused: (v: boolean) => void;
  setActiveTerritory: (coords: Coord[] | null) => void;
  resetRoute: () => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  position: null,
  route: [],
  otherPlayers: {},
  isTracking: false,
  isPaused: false,
  activeTerritory: null,
  setPosition: (coord) => set({ position: coord }),
  appendRoute: (coord) =>
    set((s) => ({
      route: [...s.route, coord],
    })),
  setOtherPlayers: (players) => set({ otherPlayers: players }),
  setIsTracking: (isTracking) => set({ isTracking }),
  setIsPaused: (isPaused) => set({ isPaused }),
  setActiveTerritory: (activeTerritory) => set({ activeTerritory }),
  resetRoute: () => set({ route: [], activeTerritory: null, isPaused: false }),
}));

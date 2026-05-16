import { create } from 'zustand';

export type Coord = { lat: number; lng: number };

interface LocationState {
  position: Coord | null;
  route: Coord[];
  otherPlayers: Record<string, Coord>;
  isTracking: boolean;
  activeTerritory: Coord[] | null;
  setPosition: (coord: Coord | null) => void;
  appendRoute: (coord: Coord) => void;
  setOtherPlayers: (players: Record<string, Coord>) => void;
  setIsTracking: (v: boolean) => void;
  setActiveTerritory: (coords: Coord[] | null) => void;
  resetRoute: () => void;
}

export const useLocationStore = create<LocationState>((set) => ({
  position: null,
  route: [],
  otherPlayers: {},
  isTracking: false,
  activeTerritory: null,
  setPosition: (coord) => set({ position: coord }),
  appendRoute: (coord) =>
    set((s) => ({
      route: [...s.route, coord],
    })),
  setOtherPlayers: (players) => set({ otherPlayers: players }),
  setIsTracking: (isTracking) => set({ isTracking }),
  setActiveTerritory: (activeTerritory) => set({ activeTerritory }),
  resetRoute: () => set({ route: [], activeTerritory: null }),
}));

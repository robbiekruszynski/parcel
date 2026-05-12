import { create } from 'zustand';

import type { LatLng } from '@/lib/geo';

export interface MapViewport {
  northEast: LatLng;
  southWest: LatLng;
}

interface MapState {
  viewport: MapViewport | null;
  setViewport: (v: MapViewport | null) => void;
}

export const useMapStore = create<MapState>((set) => ({
  viewport: null,
  setViewport: (viewport) => set({ viewport }),
}));

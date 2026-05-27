import { create } from 'zustand';

import type { Coord } from '@/stores/locationStore';
import type { StravaUploadStatus } from '@/stores/stravaStore';

export interface SessionResult {
  /** Route to display on the recap map.
   *  If a parcel was claimed this is the pre-claim loop; otherwise the full walk. */
  route: Coord[];
  activityType: string;
  startedAt: number | null;
  endedAt: number;
  /** Distance in metres — computed from the display route. */
  distanceM: number;
  claimedParcel: boolean;
  parcelAreaM2: number | null;
  parcelPoints: number;
  parcelColor: string;
  parcelTier: string | null;
  coOwners: string[];
  /** [lat, lng] pairs from the stored parcel — used to render the polygon on the map. */
  parcelCoords: [number, number][] | null;
  stravaConnected: boolean;
  stravaUploadStatus: StravaUploadStatus;
}

interface SessionResultState {
  result: SessionResult | null;
  setResult: (r: SessionResult) => void;
  clearResult: () => void;
}

export const useSessionResultStore = create<SessionResultState>((set) => ({
  result: null,
  setResult: (result) => set({ result }),
  clearResult: () => set({ result: null }),
}));

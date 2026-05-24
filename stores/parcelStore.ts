import { create } from 'zustand';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Parcel {
  id: string;
  owner_id: string;
  /** [lat, lng] pairs — matches the jsonb storage format in Supabase. */
  coordinates: [number, number][];
  area_sqm: number;
  claimed_at: string;
  color: string;
  points: number;
  activity: string;
  owner_username: string | null;
  owner_display_name: string | null;
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface ParcelState {
  /** All parcels loaded from Supabase (all users). */
  parcels: Parcel[];
  /** True while the initial fetch is in flight. */
  isLoading: boolean;
  /** Parcel the user has tapped on the map (drives the detail sheet). */
  selectedParcel: Parcel | null;

  setParcels: (parcels: Parcel[]) => void;
  /** Prepend a newly claimed parcel without re-fetching the entire list. */
  addParcel: (parcel: Parcel) => void;
  /** Update a single parcel in place (e.g. after points tick). */
  updateParcel: (id: string, patch: Partial<Parcel>) => void;
  removeParcel: (id: string) => void;
  setLoading: (v: boolean) => void;
  setSelectedParcel: (parcel: Parcel | null) => void;
}

export const useParcelStore = create<ParcelState>((set) => ({
  parcels: [],
  isLoading: false,
  selectedParcel: null,

  setParcels: (parcels) => set({ parcels }),

  addParcel: (parcel) =>
    set((s) => ({ parcels: [parcel, ...s.parcels] })),

  updateParcel: (id, patch) =>
    set((s) => ({
      parcels: s.parcels.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),

  removeParcel: (id) =>
    set((s) => ({ parcels: s.parcels.filter((p) => p.id !== id) })),

  setLoading: (isLoading) => set({ isLoading }),

  setSelectedParcel: (selectedParcel) => set({ selectedParcel }),
}));

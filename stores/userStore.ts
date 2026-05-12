import { create } from 'zustand';

export interface ProfileSnapshot {
  id: string;
  username: string;
  displayName: string | null;
  pointsBalance: number;
  pointsTotal: number;
}

interface UserState {
  profile: ProfileSnapshot | null;
  setProfile: (p: ProfileSnapshot | null) => void;
}

export const useUserStore = create<UserState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
}));

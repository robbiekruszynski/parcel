import { create } from 'zustand';

import { appStorage } from '@/lib/storage';

const STORAGE_KEY = 'parcel:pending-group-join';

export type GroupJoinSource = 'code' | 'deep_link' | 'username_invite';

export interface PendingGroupJoin {
  groupId: string;
  groupName: string;
  inviteCode: string;
  source: GroupJoinSource;
  inviteId?: string;
  fromUsername?: string | null;
  creatorUsername?: string | null;
  memberCount?: number;
}

interface GroupJoinState {
  pending: PendingGroupJoin | null;
  hydrated: boolean;
  setPending: (pending: PendingGroupJoin | null) => Promise<void>;
  hydrate: () => Promise<void>;
}

async function persist(pending: PendingGroupJoin | null) {
  if (pending) {
    await appStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
  } else {
    await appStorage.removeItem(STORAGE_KEY);
  }
}

export const useGroupJoinStore = create<GroupJoinState>((set) => ({
  pending: null,
  hydrated: false,

  hydrate: async () => {
    const raw = await appStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        set({ pending: JSON.parse(raw) as PendingGroupJoin, hydrated: true });
        return;
      } catch {
        await appStorage.removeItem(STORAGE_KEY);
      }
    }
    set({ hydrated: true });
  },

  setPending: async (pending) => {
    await persist(pending);
    set({ pending });
  },
}));

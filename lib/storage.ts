import AsyncStorage from '@react-native-async-storage/async-storage';

const memory = new Map<string, string>();
let nativeAvailable: boolean | null = null;

async function canUseNativeStorage(): Promise<boolean> {
  if (nativeAvailable !== null) return nativeAvailable;

  try {
    const probeKey = '__parcel_storage_probe__';
    await AsyncStorage.setItem(probeKey, '1');
    await AsyncStorage.removeItem(probeKey);
    nativeAvailable = true;
  } catch {
    nativeAvailable = false;
    if (__DEV__) {
      console.warn('[parcel] AsyncStorage unavailable; using in-memory session storage for this run.');
    }
  }

  return nativeAvailable;
}

/** Supabase + Zustand-compatible storage with in-memory fallback for Expo Go edge cases. */
export const appStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (await canUseNativeStorage()) {
      return AsyncStorage.getItem(key);
    }
    return memory.get(key) ?? null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (await canUseNativeStorage()) {
      await AsyncStorage.setItem(key, value);
      return;
    }
    memory.set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (await canUseNativeStorage()) {
      await AsyncStorage.removeItem(key);
      return;
    }
    memory.delete(key);
  },
};

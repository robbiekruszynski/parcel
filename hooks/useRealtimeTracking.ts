import * as Location from 'expo-location';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  coordFromLocation,
  MAP_TRACKING_WATCH_OPTIONS,
} from '@/lib/mapLocation';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useLocationStore } from '@/stores/locationStore';

export type TrackingPermissionState =
  | 'idle'
  | 'denied_foreground'
  | 'denied_auth'
  | 'missing_supabase';

export function useRealtimeTracking() {
  const [permissionIssue, setPermissionIssue] = useState<TrackingPermissionState>('idle');
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const uidRef = useRef<string | null>(null);

  const startLocationWatch = useCallback(async (uid: string) => {
    watchRef.current?.remove();

    watchRef.current = await Location.watchPositionAsync(
      MAP_TRACKING_WATCH_OPTIONS,
      async (loc) => {
        const coord = coordFromLocation(loc);
        if (!coord) return;

        useLocationStore.getState().setPosition(coord);
        useLocationStore.getState().appendRoute(coord);

        const { error } = await supabase.from('locations').insert({
          user_id: uid,
          lat: coord.lat,
          lng: coord.lng,
        });

        if (__DEV__ && error) {
          console.warn('[useRealtimeTracking] location insert failed', error.message);
        }
      }
    );
  }, []);

  const stopTracking = useCallback(async () => {
    watchRef.current?.remove();
    watchRef.current = null;

    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    uidRef.current = null;
    useLocationStore.getState().setIsPaused(false);
    useLocationStore.getState().setIsTracking(false);
    useLocationStore.getState().resetRoute();
  }, []);

  const pauseTracking = useCallback(() => {
    if (!useLocationStore.getState().isTracking) return;
    watchRef.current?.remove();
    watchRef.current = null;
    useLocationStore.getState().setIsPaused(true);
  }, []);

  const resumeTracking = useCallback(async () => {
    const uid = uidRef.current;
    if (
      !uid ||
      !useLocationStore.getState().isTracking ||
      !useLocationStore.getState().isPaused
    ) {
      return;
    }

    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== Location.PermissionStatus.GRANTED) {
      setPermissionIssue('denied_foreground');
      return;
    }

    setPermissionIssue('idle');
    useLocationStore.getState().setIsPaused(false);
    await startLocationWatch(uid);
  }, [startLocationWatch]);

  const startTracking = useCallback(async () => {
    if (useLocationStore.getState().isTracking) return;

    if (!isSupabaseConfigured) {
      setPermissionIssue('missing_supabase');
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
      setPermissionIssue('denied_auth');
      return;
    }

    const uid = session.user.id;

    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== Location.PermissionStatus.GRANTED) {
      setPermissionIssue('denied_foreground');
      return;
    }

    setPermissionIssue('idle');

    useLocationStore.getState().resetRoute();
    const seed = useLocationStore.getState().position;
    if (seed) {
      useLocationStore.getState().appendRoute(seed);
    }

    useLocationStore.getState().setIsPaused(false);
    useLocationStore.getState().setIsTracking(true);
    uidRef.current = uid;

    const channel = supabase
      .channel(`locations-realtime-${uid}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'locations' },
        (payload) => {
          const row = payload.new as { user_id?: string; lat?: number; lng?: number };
          if (!row.user_id || row.lat == null || row.lng == null) return;
          if (row.user_id === uid) return;

          const prev = useLocationStore.getState().otherPlayers;
          useLocationStore.getState().setOtherPlayers({
            ...prev,
            [row.user_id]: { lat: row.lat, lng: row.lng },
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    await startLocationWatch(uid);
  }, [startLocationWatch]);

  useEffect(() => {
    return () => {
      watchRef.current?.remove();
      watchRef.current = null;
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      uidRef.current = null;
      useLocationStore.getState().setIsPaused(false);
      useLocationStore.getState().setIsTracking(false);
    };
  }, []);

  return {
    startTracking,
    stopTracking,
    pauseTracking,
    resumeTracking,
    permissionIssue,
    clearPermissionIssue: () => setPermissionIssue('idle'),
  };
}

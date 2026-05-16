import * as Location from 'expo-location';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';

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

  const stopTracking = useCallback(async () => {
    watchRef.current?.remove();
    watchRef.current = null;

    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    useLocationStore.getState().setIsTracking(false);
    useLocationStore.getState().resetRoute();
  }, []);

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
    useLocationStore.getState().setIsTracking(true);

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

    watchRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 3000,
        distanceInterval: 5,
      },
      async (loc) => {
        const coord = {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        };

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

  useEffect(() => {
    return () => {
      watchRef.current?.remove();
      watchRef.current = null;
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      useLocationStore.getState().setIsTracking(false);
    };
  }, []);

  return {
    startTracking,
    stopTracking,
    permissionIssue,
    clearPermissionIssue: () => setPermissionIssue('idle'),
  };
}

import * as Location from 'expo-location';
import * as KeepAwake from 'expo-keep-awake';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  setBackgroundTrackingContext,
  startBackgroundLocationWatch,
  stopBackgroundLocationWatch,
} from '@/lib/backgroundLocationTask';
import {
  startSessionNotification,
  stopSessionNotification,
} from '@/lib/sessionNotification';
import { addSessionParticipant } from '@/lib/sessionParticipants';
import {
  coordFromLocation,
  MAP_TRACKING_WATCH_OPTIONS,
} from '@/lib/mapLocation';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useLocationStore } from '@/stores/locationStore';
import { useSessionStore } from '@/stores/sessionStore';

const KEEP_AWAKE_TAG = 'parcel-tracking';

export type TrackingPermissionState =
  | 'idle'
  | 'denied_foreground'
  | 'denied_background'
  | 'denied_auth'
  | 'missing_supabase';

async function applyLocationSample(
  loc: Location.LocationObject,
  uid: string,
  sessionId: string | null,
): Promise<void> {
  const coord = coordFromLocation(loc);
  if (!coord) return;

  useLocationStore.getState().setPosition(coord);
  useLocationStore.getState().appendRoute(coord);

  const { error } = await supabase.from('locations').insert({
    user_id: uid,
    lat: coord.lat,
    lng: coord.lng,
    session_id: sessionId,
  });

  if (__DEV__ && error) {
    console.warn('[useRealtimeTracking] location insert failed', error.message);
  }
}

/**
 * Fetch all location rows for the current session from Supabase and rebuild
 * the in-memory route. Called when the app returns to the foreground so that
 * any gaps recorded by the background task are filled in.
 */
async function rebuildRouteFromDB(uid: string, sessionId: string): Promise<void> {
  const { data } = await supabase
    .from('locations')
    .select('lat, lng, recorded_at')
    .eq('user_id', uid)
    .eq('session_id', sessionId)
    .order('recorded_at', { ascending: true });

  if (!data || data.length < 2) return;

  const rebuilt = data.map((r) => ({
    lat: r.lat as number,
    lng: r.lng as number,
    ts:  new Date(r.recorded_at as string).getTime(),
  }));

  // Preserve any in-memory points newer than the last DB row (race window)
  const lastDbTs = rebuilt[rebuilt.length - 1].ts;
  const current  = useLocationStore.getState().route;
  const newer    = current.filter((c) => (c.ts ?? 0) > lastDbTs);

  useLocationStore.getState().setRoute([...rebuilt, ...newer]);
}

export function useRealtimeTracking() {
  const [permissionIssue, setPermissionIssue] = useState<TrackingPermissionState>('idle');
  const watchRef    = useRef<Location.LocationSubscription | null>(null);
  const channelRef  = useRef<RealtimeChannel | null>(null);
  const uidRef      = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>('active');

  const stopForegroundWatch = useCallback(() => {
    watchRef.current?.remove();
    watchRef.current = null;
  }, []);

  const startForegroundWatch = useCallback(async (uid: string, sessionId: string | null) => {
    stopForegroundWatch();

    watchRef.current = await Location.watchPositionAsync(
      MAP_TRACKING_WATCH_OPTIONS,
      (loc) => {
        void applyLocationSample(loc, uid, sessionId);
      },
    );
  }, [stopForegroundWatch]);

  const startLocationWatch = useCallback(async (uid: string, sessionId: string | null) => {
    setBackgroundTrackingContext(uid, sessionId);
    const bgStarted = await startBackgroundLocationWatch();

    if (bgStarted) {
      stopForegroundWatch();
      return;
    }

    await startForegroundWatch(uid, sessionId);
  }, [startForegroundWatch, stopForegroundWatch]);

  const stopTracking = useCallback(async () => {
    stopForegroundWatch();
    await stopBackgroundLocationWatch();
    setBackgroundTrackingContext(null, null);
    await stopSessionNotification();
    KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);

    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    uidRef.current = null;
    useSessionStore.getState().endSession();
    useLocationStore.getState().setSessionStartedAt(null);
    useLocationStore.getState().setIsPaused(false);
    useLocationStore.getState().setIsTracking(false);
    useLocationStore.getState().resetRoute();
  }, [stopForegroundWatch]);

  const pauseTracking = useCallback(async () => {
    if (!useLocationStore.getState().isTracking) return;
    stopForegroundWatch();
    await stopBackgroundLocationWatch();
    KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
    useLocationStore.getState().setIsPaused(true);
  }, [stopForegroundWatch]);

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
    await KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    const sessionId = useSessionStore.getState().sessionId;
    await startLocationWatch(uid, sessionId);
  }, [startLocationWatch]);

  const startTracking = useCallback(async () => {
    if (useLocationStore.getState().isTracking) return;

    // Reset route immediately — prevents a stale route from the previous session
    // showing a false loop-close before the async setup completes.
    useLocationStore.getState().resetRoute();

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

    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== Location.PermissionStatus.GRANTED) {
      setPermissionIssue('denied_foreground');
      return;
    }

    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== Location.PermissionStatus.GRANTED && __DEV__) {
      console.warn('[useRealtimeTracking] background location not granted — tracking may pause when app is backgrounded');
    }

    setPermissionIssue('idle');

    const activity = useSessionStore.getState().activity ?? 'walking';
    const sessionId = useSessionStore.getState().sessionId;
    if (!sessionId) {
      useSessionStore.getState().resetSession(activity);
    }
    const activeSessionId = useSessionStore.getState().sessionId!;

    const sessionStartedAt = new Date().toISOString();
    await supabase.from('sessions').insert({
      id: activeSessionId,
      user_id: uid,
      activity,
      started_at: sessionStartedAt,
    });
    await addSessionParticipant(activeSessionId, uid);

    useLocationStore.getState().setSessionStartedAt(sessionStartedAt);
    useLocationStore.getState().resetRoute();
    const seed = useLocationStore.getState().position;
    if (seed) {
      useLocationStore.getState().appendRoute(seed);
    }

    useLocationStore.getState().setIsPaused(false);
    useLocationStore.getState().setIsTracking(true);
    uidRef.current = uid;
    await KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    await startSessionNotification(activity);

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

    await startLocationWatch(uid, activeSessionId);
  }, [startLocationWatch]);

  // ── Foreground return: rebuild route from DB to fill background gaps ─────
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState !== 'active') return;
      if (prev === 'active') return; // wasn't actually backgrounded

      const store = useLocationStore.getState();
      const uid   = uidRef.current;
      const sessionId = useSessionStore.getState().sessionId;
      if (!store.isTracking || store.isPaused || !uid || !sessionId) return;

      void (async () => {
        await rebuildRouteFromDB(uid, sessionId);
        await startForegroundWatch(uid, sessionId);
      })();
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [startForegroundWatch]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopForegroundWatch();
      void stopBackgroundLocationWatch();
      setBackgroundTrackingContext(null, null);
      void stopSessionNotification();
      KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG);
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      uidRef.current = null;
      useLocationStore.getState().setSessionStartedAt(null);
      useLocationStore.getState().setIsPaused(false);
      useLocationStore.getState().setIsTracking(false);
    };
  }, [stopForegroundWatch]);

  return {
    startTracking,
    stopTracking,
    pauseTracking,
    resumeTracking,
    permissionIssue,
    clearPermissionIssue: () => setPermissionIssue('idle'),
  };
}

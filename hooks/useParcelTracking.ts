/**
 * useParcelTracking.ts
 *
 * Game-mechanic layer on top of useRealtimeTracking.
 */

import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import area from '@turf/area';

import { useRealtimeTracking } from '@/hooks/useRealtimeTracking';
import { registerSessionStopHandler } from '@/lib/sessionControl';
import {
  buildGeoJsonPolygon,
  calculateAreaM2,
  isLoopClosed,
  MIN_PARCEL_POINTS,
  prepareClaimRoute,
  routeLengthMeters,
  routeToLatLngPairs,
  userParcelColor,
} from '@/lib/parcelGeometry';
import { rowToParcel, type ParcelRow } from '@/lib/parcelRow';
import { fetchSessionParticipantIds } from '@/lib/sessionParticipants';
import { subscribeParcelInserts } from '@/lib/subscribeParcelInserts';
import { supabase } from '@/lib/supabase';
import {
  markStravaUploadForRetry,
  RECONNECT_MSG,
} from '@/lib/stravaUploadQueue';
import { uploadSessionToStrava } from '@/lib/stravaUpload';
import { tierFromAreaKm2 } from '@/lib/tiers';
import { useLocationStore, type Coord } from '@/stores/locationStore';
import { useParcelStore, type Parcel } from '@/stores/parcelStore';
import { usePairStore } from '@/stores/pairStore';
import { useSessionStore, type Activity } from '@/stores/sessionStore';
import { useSessionResultStore } from '@/stores/sessionResultStore';
import { useStravaStore } from '@/stores/stravaStore';

export type ActivityType = 'walking' | 'running' | 'cycling' | 'rollerblading';

export { rowToParcel } from '@/lib/parcelRow';

function toSessionActivity(type: ActivityType): Activity {
  if (type === 'rollerblading') return 'rollerblading';
  return type;
}

export function useParcelTracking(activityType: ActivityType = 'walking') {
  const tracking = useRealtimeTracking();

  const route      = useLocationStore((s) => s.route);
  const isTracking = useLocationStore((s) => s.isTracking);
  const isPaused   = useLocationStore((s) => s.isPaused);
  const hasClaimedParcel = useSessionStore((s) => s.hasClaimedParcel);
  const sessionId        = useSessionStore((s) => s.sessionId);

  const routeSnapshotRef = useRef(route);
  useEffect(() => { routeSnapshotRef.current = route; }, [route]);

  // Captured inside claimParcel before resetRoute() is called — lets stopTracking
  // show the pre-claim loop on the recap map even though the route was cleared.
  const claimRouteSnapshotRef  = useRef<Coord[]>([]);
  const claimColorRef          = useRef<string>('');
  const claimPointsRef         = useRef<number>(0);
  const claimAreaM2Ref         = useRef<number | null>(null);
  const claimCoordsRef         = useRef<[number, number][] | null>(null);
  const claimCoOwnersRef       = useRef<string[]>([]);

  const loopClosed = useMemo(
    () => isLoopClosed(route, { alreadyClaimedThisSession: hasClaimedParcel }),
    [route, hasClaimedParcel],
  );
  const distanceM  = useMemo(() => routeLengthMeters(route), [route]);
  const areaM2     = useMemo(() => {
    if (!loopClosed || route.length < MIN_PARCEL_POINTS) return null;
    try { return calculateAreaM2(route); } catch { return null; }
  }, [loopClosed, route]);

  useEffect(() => subscribeParcelInserts(), []);

  const loadParcels = useCallback(async () => {
    useParcelStore.getState().setLoading(true);
    try {
      const { data, error } = await supabase
        .from('parcels')
        .select(`
          id, owner_id, co_owner_id, co_owners, group_id, coordinates, area_sqm, claimed_at,
          color, points, activity,
          profiles ( username, display_name ),
          groups ( name )
        `)
        .not('coordinates', 'is', null)
        .order('claimed_at', { ascending: false })
        .limit(500);

      if (error) {
        if (__DEV__) console.warn('[useParcelTracking] loadParcels:', error.message);
        return;
      }
      const parcels: Parcel[] = ((data ?? []) as unknown as ParcelRow[]).map(rowToParcel);
      useParcelStore.getState().setParcels(parcels);
    } finally {
      useParcelStore.getState().setLoading(false);
    }
  }, []);

  useEffect(() => { void loadParcels(); }, [loadParcels]);

  const uploadToStrava = useCallback(async (
    routeToUpload: typeof route,
    parcelsClaimed: number,
  ) => {
    const store = useStravaStore.getState();
    if (!store.isConnected) return;
    if (routeToUpload.length < 2) return;

    if (!store.syncReady) {
      await new Promise<void>((resolve) => {
        const unsub = useStravaStore.subscribe((s) => {
          if (s.syncReady) { unsub(); resolve(); }
        });
        setTimeout(() => { unsub(); resolve(); }, 4_000);
      });
    }

    if (!useStravaStore.getState().isConnected) return;

    useStravaStore.getState().setLastUpload(routeToUpload, activityType, parcelsClaimed);
    useStravaStore.getState().setUploadStatus('uploading');

    const result = await uploadSessionToStrava(routeToUpload, activityType, parcelsClaimed);

    if (result.success) {
      useStravaStore.getState().setUploadQueued(false);
      useStravaStore.getState().setUploadStatus('success');
      setTimeout(() => {
        if (useStravaStore.getState().uploadStatus === 'success') {
          useStravaStore.getState().clearUploadStatus();
        }
      }, 4_000);
    } else if (result.notConnected) {
      useStravaStore.getState().clearUploadStatus();
    } else if (result.needsReconnect || result.error?.includes('expired')) {
      markStravaUploadForRetry();
      useStravaStore.getState().setUploadStatus('failed', RECONNECT_MSG);
    } else {
      markStravaUploadForRetry();
      useStravaStore.getState().setUploadStatus(
        'failed',
        result.error ?? 'Upload to Strava failed.',
      );
    }
  }, [activityType]);

  const stopTracking = useCallback(async () => {
    const snapshot = [...routeSnapshotRef.current];

    // If a parcel was claimed this session, use the pre-claim route snapshot
    // (claimRouteSnapshotRef) — the live route was reset to [] after claiming.
    const claimed       = useSessionStore.getState().hasClaimedParcel;
    const displayRoute  = claimed && claimRouteSnapshotRef.current.length > 0
      ? claimRouteSnapshotRef.current
      : snapshot;

    const sessionState  = useSessionStore.getState();
    const stravaState   = useStravaStore.getState();

    const parcelAreaM2  = claimAreaM2Ref.current;
    const areaKm2       = parcelAreaM2 != null ? parcelAreaM2 / 1_000_000 : null;

    useSessionResultStore.getState().setResult({
      route:        displayRoute,
      activityType: activityType,
      startedAt:    sessionState.startedAt,
      endedAt:      Date.now(),
      distanceM:    routeLengthMeters(displayRoute),
      claimedParcel: claimed,
      parcelAreaM2,
      parcelPoints:  claimPointsRef.current,
      parcelColor:   claimColorRef.current,
      parcelTier:    areaKm2 != null ? tierFromAreaKm2(areaKm2) : null,
      coOwners:      claimCoOwnersRef.current,
      parcelCoords:  claimCoordsRef.current,
      stravaConnected:   stravaState.isConnected,
      stravaUploadStatus: stravaState.uploadStatus,
    });

    await tracking.stopTracking();

    // Upload to Strava using the full route (not the shorter display route).
    if (snapshot.length >= 2 && routeLengthMeters(snapshot) > 50) {
      void uploadToStrava(snapshot, claimed ? 1 : 0);
    }

    router.replace('/tracking/session-end');
  }, [tracking, uploadToStrava, activityType]);

  useEffect(() => {
    registerSessionStopHandler(stopTracking);
    return () => registerSessionStopHandler(null);
  }, [stopTracking]);

  const startTracking = useCallback(async () => {
    usePairStore.getState().leaveParty();
    useSessionStore.getState().resetSession(toSessionActivity(activityType));
    // Explicitly clear route here so hasClaimedParcel=false and route=[] are set
    // atomically before any async tracking setup begins.
    useLocationStore.getState().resetRoute();
    await tracking.startTracking();
  }, [tracking, activityType]);

  const claimParcel = useCallback(async (): Promise<void> => {
    if (!loopClosed) throw new Error('Walk back to your starting point to close the loop.');
    if (route.length < MIN_PARCEL_POINTS) throw new Error('Route too short — keep moving.');
    if (hasClaimedParcel) throw new Error('You already claimed a parcel this session.');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) throw new Error('Sign in to claim territory.');

    const uid = session.user.id;
    let activeSessionId = sessionId ?? useSessionStore.getState().sessionId;

    const cleanedRoute = prepareClaimRoute(route);
    const coordinates  = routeToLatLngPairs(cleanedRoute);
    const area_sqm     = area(buildGeoJsonPolygon(cleanedRoute));
    const color        = userParcelColor(uid);
    const fullPoints   = Math.max(1, Math.round(area_sqm / 50));

    // Guard against parcels_session_id_fkey violation: if the sessions row
    // was never written (silent failure in startTracking), upsert it now so
    // the FK is satisfied. ignoreDuplicates means this is a no-op when the
    // row already exists — safe to call unconditionally.
    // If the upsert itself fails, fall back to null so the parcel insert
    // uses a null session_id (allowed by schema) rather than a dangling UUID.
    if (activeSessionId) {
      const { error: sessionUpsertErr } = await supabase
        .from('sessions')
        .upsert(
          {
            id: activeSessionId,
            user_id: uid,
            activity: activityType,
            started_at: new Date().toISOString(),
          },
          { onConflict: 'id', ignoreDuplicates: true },
        );
      if (sessionUpsertErr) {
        console.warn('[claimParcel] sessions upsert failed:', sessionUpsertErr.message);
        activeSessionId = null;
      }
    }

    // Session participants from DB (populated when session starts + when partner
    // is explicitly added). Also merge local in-memory partners — they may not
    // have been written to session_participants if the pair was accepted after
    // the session was already running (pair_requests don't carry the session ID).
    const dbParticipantIds = activeSessionId
      ? await fetchSessionParticipantIds(activeSessionId)
      : [uid];
    const localPartnerIds = usePairStore.getState().partners.map((p) => p.id);

    const uniqueParticipants = [
      ...new Set([uid, ...dbParticipantIds, ...localPartnerIds].filter(Boolean)),
    ];
    const coOwnerIds = uniqueParticipants.filter((id) => id !== uid);
    const partySize = uniqueParticipants.length;
    const eachPts   = partySize > 1
      ? Math.max(1, Math.floor(fullPoints / partySize))
      : fullPoints;

    let sharedGroupId: string | null = null;
    if (coOwnerIds.length > 0) {
      const allIds = [uid, ...coOwnerIds];
      const { data: memberRows } = await supabase
        .from('group_members')
        .select('group_id, user_id')
        .in('user_id', allIds);

      if (memberRows) {
        const countByGroup: Record<string, number> = {};
        for (const r of memberRows) {
          countByGroup[r.group_id] = (countByGroup[r.group_id] ?? 0) + 1;
        }
        const found = Object.entries(countByGroup).find(([, c]) => c >= allIds.length);
        sharedGroupId = found?.[0] ?? null;
      }
    }

    const { data, error } = await supabase
      .from('parcels')
      .insert({
        owner_id:    uid,
        session_id:  activeSessionId,
        co_owner_id: coOwnerIds[0] ?? null,
        co_owners:   coOwnerIds,
        group_id:    sharedGroupId,
        activity:    activityType,
        coordinates,
        area_sqm,
        color,
        points:      eachPts,
        claimed_at:  new Date().toISOString(),
      })
      .select(`
        id, owner_id, co_owner_id, co_owners, group_id, coordinates, area_sqm, claimed_at,
        color, points, activity,
        profiles ( username, display_name ),
        groups ( name )
      `)
      .single();

    if (error) throw new Error(error.message);
    if (data) useParcelStore.getState().addParcel(rowToParcel(data as unknown as ParcelRow));

    await Promise.all(
      uniqueParticipants.map((pid) =>
        supabase.rpc('credit_parcel_points', { p_uid: pid, p_points: eachPts })
          .then(({ error: e }) => {
            if (__DEV__ && e) console.warn('[claimParcel] points credit failed for', pid, e.message);
          })
      )
    );

    useSessionStore.getState().setHasClaimedParcel(true);

    // Capture claim data for the recap screen BEFORE clearing pairing / route.
    const claimedPartners = usePairStore.getState().partners;
    claimCoOwnersRef.current = claimedPartners
      .filter((p) => coOwnerIds.includes(p.id))
      .map((p) => p.username ?? p.id);
    claimColorRef.current   = color;
    claimPointsRef.current  = eachPts;
    claimAreaM2Ref.current  = area_sqm;
    claimCoordsRef.current  = coordinates as [number, number][];
    claimRouteSnapshotRef.current = [...route];

    usePairStore.getState().clearPairing();

    const snapshot = [...route];
    useLocationStore.getState().resetRoute();
    void uploadToStrava(snapshot, 1);
  }, [
    loopClosed,
    route,
    activityType,
    uploadToStrava,
    hasClaimedParcel,
    sessionId,
  ]);

  return {
    startTracking,
    stopTracking,
    pauseTracking:        tracking.pauseTracking,
    resumeTracking:       tracking.resumeTracking,
    permissionIssue:      tracking.permissionIssue,
    clearPermissionIssue: tracking.clearPermissionIssue,

    isTracking,
    isPaused,
    route,

    loopClosed,
    distanceM,
    areaM2,
    claimParcel,
    loadParcels,
  };
}

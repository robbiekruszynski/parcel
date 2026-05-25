/**
 * useParcelTracking.ts
 *
 * Game-mechanic layer on top of useRealtimeTracking.
 * Handles:
 *  - Loop detection (30 m threshold)
 *  - Parcel claiming (save to Supabase parcels table)
 *  - Loading all parcels from Supabase on mount
 *  - Strava upload after claim or session end
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useRealtimeTracking } from '@/hooks/useRealtimeTracking';
import {
  calculateAreaM2,
  isLoopClosed,
  MIN_PARCEL_POINTS,
  routeLengthMeters,
  routeToLatLngPairs,
  userParcelColor,
} from '@/lib/parcelGeometry';
import { supabase } from '@/lib/supabase';
import { uploadSessionToStrava } from '@/lib/stravaUpload';
import { useLocationStore } from '@/stores/locationStore';
import { useParcelStore, type Parcel } from '@/stores/parcelStore';
import { usePairStore } from '@/stores/pairStore';
import { useStravaStore } from '@/stores/stravaStore';

export type ActivityType = 'walking' | 'running' | 'cycling' | 'rollerblading';

// ─── Row shape returned from Supabase ─────────────────────────────────────────

interface ParcelRow {
  id: string;
  owner_id: string;
  co_owner_id: string | null;
  coordinates: [number, number][] | null;
  area_sqm: number | null;
  claimed_at: string;
  color: string | null;
  points: number | null;
  activity: string | null;
  profiles: { username: string | null; display_name: string | null } | null;
}

export function rowToParcel(row: ParcelRow): Parcel {
  return {
    id:                  row.id,
    owner_id:            row.owner_id,
    co_owner_id:         row.co_owner_id ?? null,
    coordinates:         row.coordinates ?? [],
    area_sqm:            row.area_sqm ?? 0,
    claimed_at:          row.claimed_at,
    color:               row.color ?? '#f5c518',
    points:              row.points ?? 0,
    activity:            row.activity ?? 'walking',
    owner_username:      row.profiles?.username ?? null,
    owner_display_name:  row.profiles?.display_name ?? null,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useParcelTracking(activityType: ActivityType = 'walking') {
  const tracking = useRealtimeTracking();

  const route      = useLocationStore((s) => s.route);
  const isTracking = useLocationStore((s) => s.isTracking);
  const isPaused   = useLocationStore((s) => s.isPaused);

  // Keep a snapshot of the route for Strava upload after reset
  const routeSnapshotRef = useRef(route);
  useEffect(() => { routeSnapshotRef.current = route; }, [route]);

  // ── Parcel geometry ────────────────────────────────────────────────────────
  const loopClosed = useMemo(() => isLoopClosed(route), [route]);
  const distanceM  = useMemo(() => routeLengthMeters(route), [route]);
  const areaM2     = useMemo(() => {
    if (!loopClosed || route.length < MIN_PARCEL_POINTS) return null;
    try { return calculateAreaM2(route); } catch { return null; }
  }, [loopClosed, route]);

  // ── Realtime: pick up new parcels from other users ────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('parcels-global-inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'parcels' },
        async (payload) => {
          const newRow = payload.new as Partial<ParcelRow>;
          if (!newRow.id) return;

          // Re-fetch with profiles join (realtime payload lacks joined tables)
          const { data } = await supabase
            .from('parcels')
            .select(`
              id, owner_id, co_owner_id, coordinates, area_sqm, claimed_at,
              color, points, activity,
              profiles ( username, display_name )
            `)
            .eq('id', newRow.id)
            .single();

          if (data) {
            useParcelStore.getState().addParcel(
              rowToParcel(data as unknown as ParcelRow)
            );
          }
        }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, []);

  // ── Load all parcels on mount ──────────────────────────────────────────────
  const loadParcels = useCallback(async () => {
    useParcelStore.getState().setLoading(true);
    try {
      const { data, error } = await supabase
        .from('parcels')
        .select(`
          id, owner_id, co_owner_id, coordinates, area_sqm, claimed_at,
          color, points, activity,
          profiles ( username, display_name )
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

  // ── Strava upload helper ──────────────────────────────────────────────────
  const uploadToStrava = useCallback(async (
    routeToUpload: typeof route,
    parcelsClaimed: number,
  ) => {
    if (!useStravaStore.getState().isConnected) return;
    if (routeToUpload.length < 2) return;
    await uploadSessionToStrava(routeToUpload, activityType, parcelsClaimed);
  }, [activityType]);

  // ── Claim parcel ──────────────────────────────────────────────────────────
  const claimParcel = useCallback(async (): Promise<void> => {
    if (!loopClosed) throw new Error('Walk back to your starting point to close the loop.');
    if (route.length < MIN_PARCEL_POINTS) throw new Error('Route too short — keep moving.');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) throw new Error('Sign in to claim territory.');

    const uid          = session.user.id;
    const coordinates  = routeToLatLngPairs(route);
    const area_sqm     = calculateAreaM2(route);
    const color        = userParcelColor(uid);
    const fullPoints   = Math.max(1, Math.round(area_sqm / 50));

    // ── Cooperative claim? ────────────────────────────────────────────────
    const { pairedUserId } = usePairStore.getState();
    const isCoop   = pairedUserId !== null;
    const ownerPts = isCoop ? Math.max(1, Math.floor(fullPoints / 2)) : fullPoints;

    const { data, error } = await supabase
      .from('parcels')
      .insert({
        owner_id:    uid,
        co_owner_id: pairedUserId ?? null,
        activity:    activityType,
        coordinates,
        area_sqm,
        color,
        points:      ownerPts,
        claimed_at:  new Date().toISOString(),
      })
      .select(`
        id, owner_id, co_owner_id, coordinates, area_sqm, claimed_at,
        color, points, activity,
        profiles ( username, display_name )
      `)
      .single();

    if (error) throw new Error(error.message);
    if (data) useParcelStore.getState().addParcel(rowToParcel(data as unknown as ParcelRow));

    // Credit owner points
    const { error: ptErr } = await supabase.rpc('credit_parcel_points', {
      p_uid: uid, p_points: ownerPts,
    });
    if (__DEV__ && ptErr) console.warn('[claimParcel] owner points credit failed:', ptErr.message);

    // Credit co-owner points (same amount)
    if (isCoop && pairedUserId) {
      const { error: coPtErr } = await supabase.rpc('credit_parcel_points', {
        p_uid: pairedUserId, p_points: ownerPts,
      });
      if (__DEV__ && coPtErr) console.warn('[claimParcel] co-owner points credit failed:', coPtErr.message);
    }

    // Clear pair state after successful claim
    usePairStore.getState().clearPairing();

    // Snapshot route before reset, then upload to Strava in background
    const snapshot = [...route];
    useLocationStore.getState().resetRoute();
    void uploadToStrava(snapshot, 1);
  }, [loopClosed, route, activityType, uploadToStrava]);

  // ── Stop tracking — wraps engine stop, uploads session if long enough ─────
  const stopTracking = useCallback(async () => {
    const snapshot = [...routeSnapshotRef.current];
    await tracking.stopTracking();
    // Only upload if route has meaningful distance (>50 m)
    if (snapshot.length >= 2 && routeLengthMeters(snapshot) > 50) {
      void uploadToStrava(snapshot, 0);
    }
  }, [tracking, uploadToStrava]);

  // ── Public API ────────────────────────────────────────────────────────────
  return {
    startTracking:        tracking.startTracking,
    stopTracking,                          // wrapped version
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

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
import type { RealtimeChannel } from '@supabase/supabase-js';

export type ActivityType = 'walking' | 'running' | 'cycling' | 'rollerblading';

// ─── Row shape returned from Supabase ─────────────────────────────────────────

interface ParcelRow {
  id: string;
  owner_id: string;
  co_owner_id: string | null;
  co_owners: string[] | null;
  group_id: string | null;
  coordinates: [number, number][] | null;
  area_sqm: number | null;
  claimed_at: string;
  color: string | null;
  points: number | null;
  activity: string | null;
  profiles: { username: string | null; display_name: string | null } | null;
  groups: { name: string | null } | null;
}

export function rowToParcel(row: ParcelRow): Parcel {
  return {
    id:                  row.id,
    owner_id:            row.owner_id,
    co_owner_id:         row.co_owner_id ?? null,
    co_owners:           row.co_owners ?? [],
    group_id:            row.group_id ?? null,
    group_name:          row.groups?.name ?? null,
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
  const parcelChannelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (parcelChannelRef.current) {
      void supabase.removeChannel(parcelChannelRef.current);
      parcelChannelRef.current = null;
    }

    const channel = supabase
      .channel(`parcels-global-inserts-${Date.now()}`)
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
              id, owner_id, co_owner_id, co_owners, group_id, coordinates, area_sqm, claimed_at,
              color, points, activity,
              profiles ( username, display_name ),
              groups ( name )
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

    parcelChannelRef.current = channel;

    return () => {
      if (parcelChannelRef.current) {
        void supabase.removeChannel(parcelChannelRef.current);
        parcelChannelRef.current = null;
      }
    };
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
    const store = useStravaStore.getState();
    if (!store.isConnected) return;
    if (routeToUpload.length < 2) return;

    // Wait for the initial DB sync to finish (max 4 s) before uploading.
    // Prevents a race where the upload fires before tokens load on first launch.
    if (!store.syncReady) {
      await new Promise<void>((resolve) => {
        const unsub = useStravaStore.subscribe((s) => {
          if (s.syncReady) { unsub(); resolve(); }
        });
        setTimeout(() => { unsub(); resolve(); }, 4_000);
      });
    }

    // Re-check after waiting — user might not be connected
    if (!useStravaStore.getState().isConnected) return;

    // Persist details so the toast can offer a retry
    useStravaStore.getState().setLastUpload(routeToUpload, activityType, parcelsClaimed);
    useStravaStore.getState().setUploadStatus('uploading');

    const result = await uploadSessionToStrava(routeToUpload, activityType, parcelsClaimed);

    if (result.success) {
      useStravaStore.getState().setUploadStatus('success');
      // Auto-dismiss success toast after 4 s
      setTimeout(() => {
        if (useStravaStore.getState().uploadStatus === 'success') {
          useStravaStore.getState().clearUploadStatus();
        }
      }, 4_000);
    } else if (result.notConnected) {
      // Not connected — silent, nothing to show
      useStravaStore.getState().clearUploadStatus();
    } else if (result.needsReconnect) {
      useStravaStore.getState().setUploadStatus(
        'failed',
        'Strava needs reconnecting — go to Profile → Account & Settings.',
      );
    } else {
      useStravaStore.getState().setUploadStatus(
        'failed',
        result.error ?? 'Upload to Strava failed.',
      );
    }
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

    // ── Cooperative claim (N-way split) ──────────────────────────────────
    const { partners } = usePairStore.getState();
    const partySize = 1 + partners.length;             // owner + all partners
    const eachPts   = Math.max(1, Math.floor(fullPoints / partySize));
    const coOwnerIds = partners.map((p) => p.id);

    // Check if all party members share a group
    let sharedGroupId: string | null = null;
    if (partners.length > 0) {
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
        co_owner_id: coOwnerIds[0] ?? null,   // legacy compat
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

    // Credit all party members equally
    const allPartyIds = [uid, ...coOwnerIds];
    await Promise.all(
      allPartyIds.map((pid) =>
        supabase.rpc('credit_parcel_points', { p_uid: pid, p_points: eachPts })
          .then(({ error: e }) => {
            if (__DEV__ && e) console.warn('[claimParcel] points credit failed for', pid, e.message);
          })
      )
    );

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

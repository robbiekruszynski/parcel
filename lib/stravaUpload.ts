/**
 * stravaUpload.ts
 *
 * Uploads a completed Parcel session as a Strava activity via GPX.
 *
 * Flow:
 *  1. Check if Strava is connected + token is valid
 *  2. Refresh token server-side if expired (STRAVA_CLIENT_SECRET lives in edge fn)
 *  3. Build GPX from route
 *  4. POST multipart to Strava /uploads
 *  5. Update stravaStore with fresh tokens
 */

import { supabase } from '@/lib/supabase';
import { buildGpx } from '@/lib/gpxExport';
import { useStravaStore } from '@/stores/stravaStore';
import type { Coord } from '@/stores/locationStore';
import type { ActivityType } from '@/hooks/useParcelTracking';

// Strava activity_type strings for each Parcel activity
const STRAVA_ACTIVITY_TYPE: Record<ActivityType, string> = {
  walking:      'Walk',
  running:      'Run',
  cycling:      'Ride',
  rollerblading:'InlineSkate',
};

export interface StravaUploadResult {
  success: boolean;
  activityId?: number;
  error?: string;
  /** True when Strava is not connected — caller can prompt reconnect */
  notConnected?: boolean;
  /** True when the upload scope is missing — caller can prompt reconnect */
  needsReconnect?: boolean;
}

/**
 * Upload a session route to Strava.
 *
 * @param route        GPS points (with `ts` timestamps)
 * @param activityType Walking / running / cycling / rollerblading
 * @param parcelsClaimed Number of parcels claimed in this session (for description)
 */
export async function uploadSessionToStrava(
  route: Coord[],
  activityType: ActivityType,
  parcelsClaimed = 0,
): Promise<StravaUploadResult> {
  const store = useStravaStore.getState();

  if (!store.isConnected || !store.accessToken) {
    return { success: false, notConnected: true };
  }

  // ── Ensure we have a valid token ─────────────────────────────────────────────
  let accessToken = store.accessToken;

  if (store.isTokenExpired() && store.refreshToken) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('strava-refresh', {
        body: { refresh_token: store.refreshToken },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      if (res.error) throw new Error(res.error.message);

      const fresh = res.data as { access_token: string; refresh_token: string; expires_at: number };
      accessToken = fresh.access_token;

      // Update store with new tokens
      store.setStravaTokens(
        {
          access_token:  fresh.access_token,
          refresh_token: fresh.refresh_token,
          expires_at:    fresh.expires_at,
          athlete:       store.athlete!,
        },
        store.syncedUserId!,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Token refresh failed';
      return { success: false, error: msg };
    }
  }

  // ── Build GPX ────────────────────────────────────────────────────────────────
  if (route.length < 2) {
    return { success: false, error: 'Route too short to upload' };
  }

  const activityName = buildActivityName(activityType);
  const description  = parcelsClaimed > 0
    ? `${parcelsClaimed} parcel${parcelsClaimed > 1 ? 's' : ''} claimed · Recorded with Parcel`
    : 'Recorded with Parcel';

  let gpxString: string;
  try {
    gpxString = buildGpx(route, { name: activityName, description });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'GPX build failed';
    return { success: false, error: msg };
  }

  // ── Upload to Strava ─────────────────────────────────────────────────────────
  const formData = new FormData();
  formData.append('activity_type', STRAVA_ACTIVITY_TYPE[activityType]);
  formData.append('name', activityName);
  formData.append('description', description);
  formData.append('data_type', 'gpx');
  // React Native FormData accepts { uri, name, type } for binary blobs
  formData.append('file', {
    uri:  `data:application/gpx+xml;base64,${btoa(unescape(encodeURIComponent(gpxString)))}`,
    name: 'activity.gpx',
    type: 'application/gpx+xml',
  } as unknown as Blob);

  try {
    const res = await fetch('https://www.strava.com/api/v3/uploads', {
      method:  'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body:    formData,
    });

    if (res.status === 403) {
      // Missing activity:write scope — user needs to reconnect
      return { success: false, needsReconnect: true };
    }

    if (!res.ok) {
      const body = await res.text();
      return { success: false, error: `Strava upload failed (${res.status}): ${body}` };
    }

    const upload = await res.json() as { id: number; activity_id?: number };
    return { success: true, activityId: upload.activity_id ?? upload.id };

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upload request failed';
    return { success: false, error: msg };
  }
}

function buildActivityName(activityType: ActivityType): string {
  const timeOfDay = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Morning';
    if (h < 17) return 'Afternoon';
    return 'Evening';
  };
  const labels: Record<ActivityType, string> = {
    walking:      'Walk',
    running:      'Run',
    cycling:      'Ride',
    rollerblading:'Skate',
  };
  return `${timeOfDay()} ${labels[activityType]} via Parcel`;
}

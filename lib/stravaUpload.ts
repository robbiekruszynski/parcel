/**
 * stravaUpload.ts
 *
 * Uploads a completed Parcel session as a Strava activity via GPX.
 *
 * Flow:
 *  1. Check if Strava is connected + token is valid
 *  2. Refresh token server-side if expired (STRAVA_CLIENT_SECRET lives in edge fn)
 *  3. Build GPX from route
 *  4. POST multipart to Strava /uploads (retry once after refresh on 401)
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

async function refreshAccessToken(): Promise<
  { ok: true; accessToken: string } | { ok: false; result: StravaUploadResult }
> {
  const store = useStravaStore.getState();

  if (!store.refreshToken) {
    return {
      ok: false,
      result: {
        success: false,
        needsReconnect: true,
        error: 'Strava session expired — reconnect Strava in Settings.',
      },
    };
  }

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
    if (!fresh?.access_token) throw new Error('Token refresh returned no access token');

    store.setStravaTokens(
      {
        access_token:  fresh.access_token,
        refresh_token: fresh.refresh_token,
        expires_at:    fresh.expires_at,
        athlete:       store.athlete!,
      },
      store.syncedUserId!,
    );

    return { ok: true, accessToken: fresh.access_token };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token refresh failed';
    return {
      ok: false,
      result: { success: false, needsReconnect: true, error: msg },
    };
  }
}

async function ensureAccessToken(): Promise<
  { ok: true; accessToken: string } | { ok: false; result: StravaUploadResult }
> {
  const store = useStravaStore.getState();
  if (!store.accessToken) {
    return { ok: false, result: { success: false, notConnected: true } };
  }

  if (store.isTokenExpired()) {
    return refreshAccessToken();
  }

  return { ok: true, accessToken: store.accessToken };
}

async function postStravaUpload(
  accessToken: string,
  formData: FormData,
): Promise<StravaUploadResult & { unauthorized?: boolean }> {
  const res = await fetch('https://www.strava.com/api/v3/uploads', {
    method:  'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body:    formData,
  });

  if (res.status === 403) {
    return { success: false, needsReconnect: true };
  }

  if (res.status === 401) {
    return { success: false, unauthorized: true };
  }

  if (!res.ok) {
    const body = await res.text();
    return { success: false, error: `Strava upload failed (${res.status}): ${body}` };
  }

  const upload = await res.json() as { id: number; activity_id?: number };
  return { success: true, activityId: upload.activity_id ?? upload.id };
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

  const formData = new FormData();
  formData.append('activity_type', STRAVA_ACTIVITY_TYPE[activityType]);
  formData.append('name', activityName);
  formData.append('description', description);
  formData.append('data_type', 'gpx');
  formData.append('file', {
    uri:  `data:application/gpx+xml;base64,${btoa(unescape(encodeURIComponent(gpxString)))}`,
    name: 'activity.gpx',
    type: 'application/gpx+xml',
  } as unknown as Blob);

  try {
    const tokenResult = await ensureAccessToken();
    if (!tokenResult.ok) return tokenResult.result;

    let uploadResult = await postStravaUpload(tokenResult.accessToken, formData);

    // Strava rejected the token — refresh once and retry.
    if (!uploadResult.success && uploadResult.unauthorized) {
      const refreshResult = await refreshAccessToken();
      if (!refreshResult.ok) return refreshResult.result;
      uploadResult = await postStravaUpload(refreshResult.accessToken, formData);
    }

    if (!uploadResult.success) {
      const { unauthorized: _ignored, ...result } = uploadResult;
      if (!result.error && uploadResult.unauthorized) {
        return {
          success: false,
          error: 'Strava session expired — reconnect Strava in Settings.',
        };
      }
      return result;
    }

    return uploadResult;
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

/**
 * stravaUpload.ts — Upload completed Parcel sessions to Strava via GPX.
 */

import { supabase } from '@/lib/supabase';
import { buildGpx } from '@/lib/gpxExport';
import {
  isStravaTokenExpired,
  refreshStravaToken,
} from '@/lib/strava';
import { useStravaStore } from '@/stores/stravaStore';
import type { Coord } from '@/stores/locationStore';
import type { ActivityType } from '@/hooks/useParcelTracking';

const STRAVA_ACTIVITY_TYPE: Record<ActivityType, string> = {
  walking:      'Walk',
  running:      'Run',
  cycling:      'Ride',
  rollerblading:'InlineSkate',
};

export const STRAVA_RECONNECT_MSG =
  'Reconnect Strava to save your activity — open Profile → Settings.';

export interface StravaUploadResult {
  success: boolean;
  activityId?: number;
  error?: string;
  notConnected?: boolean;
  needsReconnect?: boolean;
}

async function ensureAccessToken(userId: string): Promise<
  { ok: true; accessToken: string } | { ok: false; result: StravaUploadResult }
> {
  const store = useStravaStore.getState();
  if (!store.accessToken) {
    return { ok: false, result: { success: false, notConnected: true } };
  }

  if (isStravaTokenExpired(store.expiresAt)) {
    const refreshed = await refreshStravaToken(userId);
    if (!refreshed.ok) {
      return {
        ok: false,
        result: {
          success: false,
          needsReconnect: true,
          error: refreshed.error ?? STRAVA_RECONNECT_MSG,
        },
      };
    }
    return { ok: true, accessToken: refreshed.accessToken! };
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
    return { success: false, needsReconnect: true, error: STRAVA_RECONNECT_MSG };
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

export async function uploadSessionToStrava(
  route: Coord[],
  activityType: ActivityType,
  parcelsClaimed = 0,
): Promise<StravaUploadResult> {
  const store = useStravaStore.getState();

  if (!store.isConnected || !store.accessToken || !store.syncedUserId) {
    return { success: false, notConnected: true };
  }

  const userId = store.syncedUserId;

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
    const tokenResult = await ensureAccessToken(userId);
    if (!tokenResult.ok) return tokenResult.result;

    let uploadResult = await postStravaUpload(tokenResult.accessToken, formData);

    if (!uploadResult.success && uploadResult.unauthorized) {
      const refreshed = await refreshStravaToken(userId);
      if (!refreshed.ok) {
        return {
          success: false,
          needsReconnect: true,
          error: refreshed.error ?? STRAVA_RECONNECT_MSG,
        };
      }
      uploadResult = await postStravaUpload(refreshed.accessToken!, formData);
    }

    if (!uploadResult.success) {
      const { unauthorized: _ignored, ...result } = uploadResult;
      if (!result.error && uploadResult.unauthorized) {
        return {
          success: false,
          needsReconnect: true,
          error: STRAVA_RECONNECT_MSG,
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
  const h = new Date().getHours();
  const timeOfDay = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
  const labels: Record<ActivityType, string> = {
    walking:      'Walk',
    running:      'Run',
    cycling:      'Ride',
    rollerblading:'Skate',
  };
  return `${timeOfDay} ${labels[activityType]} via Parcel`;
}

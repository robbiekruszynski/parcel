import { supabase } from '@/lib/supabase';
import { retryQueuedStravaUpload } from '@/lib/stravaUploadQueue';
import { useStravaStore } from '@/stores/stravaStore';

/** Normalize DB values (bigint seconds, ISO strings, ms) to unix seconds. */
function normalizeExpiresAt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e12 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === 'string') {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && asNum > 0) {
      return asNum > 1e12 ? Math.floor(asNum / 1000) : Math.floor(asNum);
    }
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return 0;
}

/** Strava connection lives in Supabase — never cache it globally on device between users. */
export async function syncStravaConnectionForUser(userId: string | null): Promise<void> {
  const store = useStravaStore.getState();
  store.setSyncReady(false);

  if (!userId) {
    store.disconnectStrava();
    return;
  }

  const { data, error } = await supabase
    .from('strava_connections')
    .select(
      'strava_athlete_id, access_token, refresh_token, expires_at, athlete_firstname, athlete_lastname, athlete_avatar'
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (__DEV__) console.warn('[strava] sync failed', error.message);
    store.disconnectStrava();
    return;
  }

  if (!data) {
    store.disconnectStrava();
    return;
  }

  store.setStravaTokens(
    {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: normalizeExpiresAt(data.expires_at),
      athlete: {
        id: data.strava_athlete_id,
        firstname: data.athlete_firstname ?? '',
        lastname: data.athlete_lastname ?? '',
        profile: data.athlete_avatar ?? '',
      },
    },
    userId
  );

  await retryQueuedStravaUpload();
}

import { supabase } from '@/lib/supabase';
import { useStravaStore } from '@/stores/stravaStore';

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
      expires_at: data.expires_at,
      athlete: {
        id: data.strava_athlete_id,
        firstname: data.athlete_firstname ?? '',
        lastname: data.athlete_lastname ?? '',
        profile: data.athlete_avatar ?? '',
      },
    },
    userId
  );
}

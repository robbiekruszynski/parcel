export const STRAVA_CLIENT_ID = process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID ?? '';
export const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/mobile/authorize';
export const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
export const STRAVA_SCOPES = 'read,activity:read_all,activity:write';

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete: StravaAthlete;
}

export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  profile: string;
}

export interface StravaActivity {
  id: number;
  name: string;
  type: string;
  sport_type: string;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  map: {
    summary_polyline: string;
  };
}

export interface StravaStreamSet {
  latlng: {
    data: [number, number][];
    type: 'latlng';
  };
}

export async function fetchActivityStream(
  activityId: number,
  accessToken: string
): Promise<[number, number][]> {
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng&key_by_type=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok) throw new Error(`Strava stream fetch failed: ${res.status}`);
  const data: StravaStreamSet = await res.json();
  return data.latlng?.data ?? [];
}

/** Server-side only. STRAVA_CLIENT_SECRET is not available in the React Native bundle. */
export async function refreshStravaToken(refreshToken: string): Promise<StravaTokens> {
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientSecret) {
    throw new Error('refreshStravaToken must run server-side with STRAVA_CLIENT_SECRET set');
  }

  const res = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error('Token refresh failed');
  return res.json();
}

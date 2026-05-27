import { supabase } from '@/lib/supabase';
import { useStravaStore } from '@/stores/stravaStore';

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

export interface StravaRefreshResult {
  ok: boolean;
  accessToken?: string;
  needsReconnect?: boolean;
  error?: string;
}

export async function fetchActivityStream(
  activityId: number,
  accessToken: string,
): Promise<[number, number][]> {
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng&key_by_type=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) throw new Error(`Strava stream fetch failed: ${res.status}`);
  const data: StravaStreamSet = await res.json();
  return data.latlng?.data ?? [];
}

/** Normalize DB values to unix seconds. */
export function normalizeStravaExpiresAt(value: unknown): number {
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

export function isStravaTokenExpired(expiresAt: number | null): boolean {
  if (!expiresAt) return true;
  return Date.now() / 1000 >= expiresAt - 300;
}

/**
 * Refresh Strava OAuth tokens for a user via the strava-refresh edge function,
 * persist to strava_connections, and update the local Zustand store.
 */
export async function refreshStravaToken(userId: string): Promise<StravaRefreshResult> {
  const store = useStravaStore.getState();

  const { data: row, error: fetchErr } = await supabase
    .from('strava_connections')
    .select('refresh_token, strava_athlete_id, athlete_firstname, athlete_lastname, athlete_avatar')
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchErr || !row?.refresh_token) {
    return {
      ok: false,
      needsReconnect: true,
      error: 'Reconnect Strava to save your activity',
    };
  }

  const refreshToken = store.refreshToken ?? row.refresh_token;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await supabase.functions.invoke('strava-refresh', {
      body: { refresh_token: refreshToken },
      headers: session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : undefined,
    });

    if (res.error) throw new Error(res.error.message);

    const fresh = res.data as {
      access_token: string;
      refresh_token: string;
      expires_at: number;
    };

    if (!fresh?.access_token) {
      throw new Error('Token refresh returned no access token');
    }

    const expiresAt = normalizeStravaExpiresAt(fresh.expires_at);

    await supabase.from('strava_connections').update({
      access_token:  fresh.access_token,
      refresh_token: fresh.refresh_token,
      expires_at:    expiresAt,
      updated_at:    new Date().toISOString(),
    }).eq('user_id', userId);

    const athlete = store.athlete ?? {
      id: row.strava_athlete_id as number,
      firstname: (row.athlete_firstname as string) ?? '',
      lastname: (row.athlete_lastname as string) ?? '',
      profile: (row.athlete_avatar as string) ?? '',
    };

    store.setStravaTokens(
      {
        access_token:  fresh.access_token,
        refresh_token: fresh.refresh_token,
        expires_at:    expiresAt,
        athlete,
      },
      userId,
    );

    return { ok: true, accessToken: fresh.access_token };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Token refresh failed';
    return { ok: false, needsReconnect: true, error: msg };
  }
}

/** Server-side only — STRAVA_CLIENT_SECRET is not in the RN bundle. */
export async function refreshStravaTokenWithSecret(refreshToken: string): Promise<StravaTokens> {
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientSecret) {
    throw new Error('refreshStravaTokenWithSecret must run server-side with STRAVA_CLIENT_SECRET set');
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
  return res.json() as Promise<StravaTokens>;
}

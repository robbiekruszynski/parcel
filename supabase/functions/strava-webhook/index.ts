import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VERIFY_TOKEN = Deno.env.get('STRAVA_WEBHOOK_VERIFY_TOKEN') ?? '';

type StravaConnection = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

type TerritoryRow = {
  id: string;
  user_id: string;
  polygon: {
    type: 'Polygon';
    coordinates: [number, number][][];
  };
};

type TerritoryHit = {
  territory_id: string;
  owner_id: string;
  sample_count: number;
};

function pointInRing(lng: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInPolygon(lng: number, lat: number, polygon: TerritoryRow['polygon']): boolean {
  const ring = polygon.coordinates[0];
  if (!ring?.length) return false;
  return pointInRing(lng, lat, ring);
}

function computeTerritoryHits(
  routeLatLng: [number, number][],
  territories: TerritoryRow[]
): TerritoryHit[] {
  const hitMap = new Map<string, TerritoryHit>();

  for (let i = 0; i < routeLatLng.length; i += 3) {
    const [lat, lng] = routeLatLng[i];
    for (const territory of territories) {
      if (!pointInPolygon(lng, lat, territory.polygon)) continue;
      const existing = hitMap.get(territory.id);
      if (existing) {
        existing.sample_count += 1;
      } else {
        hitMap.set(territory.id, {
          territory_id: territory.id,
          owner_id: territory.user_id,
          sample_count: 1,
        });
      }
    }
  }

  return [...hitMap.values()];
}

async function refreshAccessToken(
  supabase: ReturnType<typeof createClient>,
  connection: StravaConnection
): Promise<string> {
  const tokenRes = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: Deno.env.get('STRAVA_CLIENT_ID'),
      client_secret: Deno.env.get('STRAVA_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error('Strava token refresh failed');
  }

  const tokens = await tokenRes.json();

  await supabase
    .from('strava_connections')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', connection.user_id);

  return tokens.access_token as string;
}

async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  connection: StravaConnection
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (connection.expires_at > now + 60) {
    return connection.access_token;
  }
  return refreshAccessToken(supabase, connection);
}

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      return new Response(JSON.stringify({ 'hub.challenge': challenge }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method === 'POST') {
    const event = await req.json();

    if (event.object_type !== 'activity' || event.aspect_type !== 'create') {
      return new Response('OK', { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const stravaAthleteId = event.owner_id;
    const stravaActivityId = event.object_id;

    const { data: connection } = await supabase
      .from('strava_connections')
      .select('user_id, access_token, refresh_token, expires_at')
      .eq('strava_athlete_id', stravaAthleteId)
      .maybeSingle();

    if (!connection) return new Response('OK', { status: 200 });

    let accessToken: string;
    try {
      accessToken = await getValidAccessToken(supabase, connection as StravaConnection);
    } catch {
      return new Response('OK', { status: 200 });
    }

    const streamRes = await fetch(
      `https://www.strava.com/api/v3/activities/${stravaActivityId}/streams?keys=latlng&key_by_type=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const streamData = await streamRes.json();
    const latlng: [number, number][] = streamData.latlng?.data ?? [];

    const activityRes = await fetch(
      `https://www.strava.com/api/v3/activities/${stravaActivityId}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!activityRes.ok) return new Response('OK', { status: 200 });
    const activity = await activityRes.json();

    const { data: territories } = await supabase
      .from('territories')
      .select('id, user_id, polygon');

    const territoryHits = computeTerritoryHits(
      latlng,
      (territories ?? []) as TerritoryRow[]
    );

    await supabase.from('strava_activities').upsert(
      {
        user_id: connection.user_id,
        strava_activity_id: stravaActivityId,
        sport_type: activity.sport_type,
        start_date: activity.start_date,
        distance_meters: activity.distance,
        moving_time_seconds: activity.moving_time,
        route_latlng: latlng,
        territory_hits: territoryHits,
        processed: true,
        processed_at: new Date().toISOString(),
      },
      { onConflict: 'strava_activity_id' }
    );

    return new Response('OK', { status: 200 });
  }

  return new Response('Method Not Allowed', { status: 405 });
});

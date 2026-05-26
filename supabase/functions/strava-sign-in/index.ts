import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sanitizeUsername(raw: string, athleteId: number): string {
  const base = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_');
  const candidate = base.length >= 3 ? base.slice(0, 24) : `athlete_${athleteId}`;
  return candidate.replace(/^_+|_+$/g, '') || `athlete_${athleteId}`;
}

function stravaParcelEmail(athleteId: number): string {
  return `strava_${athleteId}@users.parcel.app`;
}

async function findOrCreateStravaParcelUser(
  supabaseAdmin: ReturnType<typeof createClient>,
  athlete: { id: number; firstname?: string; lastname?: string }
): Promise<{ userId: string; email: string }> {
  // Fast path: returning user with an existing Strava connection record
  const { data: existingConnection } = await supabaseAdmin
    .from('strava_connections')
    .select('user_id')
    .eq('strava_athlete_id', athlete.id)
    .maybeSingle();

  if (existingConnection?.user_id) {
    const { data: { user }, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(
      existingConnection.user_id
    );
    if (getUserError || !user?.email) {
      throw new Error('Found Strava connection but could not load the linked user');
    }
    return { userId: user.id, email: user.email };
  }

  const email = stravaParcelEmail(athlete.id);

  // Returning Strava-only account (auth user exists but connection row was removed)
  const { data: existingByEmail, error: emailLookupError } =
    await supabaseAdmin.auth.admin.getUserByEmail(email);

  if (existingByEmail?.user?.email) {
    return { userId: existingByEmail.user.id, email: existingByEmail.user.email };
  }

  if (
    emailLookupError &&
    !/not found|user not found/i.test(emailLookupError.message)
  ) {
    throw new Error(emailLookupError.message);
  }

  // Brand-new Strava user
  const username = sanitizeUsername(`${athlete.firstname ?? 'athlete'}_${athlete.id}`, athlete.id);
  const displayName = `${athlete.firstname ?? ''} ${athlete.lastname ?? ''}`.trim() || null;

  const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { username, display_name: displayName, strava_athlete_id: athlete.id },
  });

  if (newUser?.user?.email) {
    return { userId: newUser.user.id, email: newUser.user.email };
  }

  // createUser raced or connection was deleted — resolve by email lookup
  if (createError?.message?.includes('already been registered')) {
    const { data: retryByEmail } = await supabaseAdmin.auth.admin.getUserByEmail(email);
    if (retryByEmail?.user?.email) {
      return { userId: retryByEmail.user.id, email: retryByEmail.user.email };
    }
  }

  throw new Error(createError?.message ?? 'Could not find or create Strava user');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { code, redirect_uri } = await req.json();

    if (!code || !redirect_uri) {
      return new Response(JSON.stringify({ error: 'Missing code or redirect_uri' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const clientId = Deno.env.get('STRAVA_CLIENT_ID')?.trim();
    const clientSecret = Deno.env.get('STRAVA_CLIENT_SECRET')?.trim();
    if (!clientId || !clientSecret) {
      return new Response(
        JSON.stringify({
          error:
            'Missing STRAVA_CLIENT_ID or STRAVA_CLIENT_SECRET in Edge Function secrets.',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const tokenRes = await fetch('https://www.strava.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri,
      }),
    });

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      return new Response(JSON.stringify({ error: 'Strava token exchange failed', detail }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokens = await tokenRes.json();
    const athlete = tokens.athlete as {
      id: number;
      firstname?: string;
      lastname?: string;
      profile?: string;
    };

    if (!athlete?.id) {
      return new Response(JSON.stringify({ error: 'Strava response missing athlete' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { userId: stravaUserId, email: userEmail } = await findOrCreateStravaParcelUser(
      supabaseAdmin,
      athlete
    );

    const connectionPayload = {
      strava_athlete_id: athlete.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at,
      athlete_firstname: athlete.firstname ?? null,
      athlete_lastname: athlete.lastname ?? null,
      athlete_avatar: athlete.profile ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data: existingConnection } = await supabaseAdmin
      .from('strava_connections')
      .select('user_id')
      .eq('strava_athlete_id', athlete.id)
      .maybeSingle();

    if (existingConnection && existingConnection.user_id !== stravaUserId) {
      await supabaseAdmin.from('strava_connections').delete().eq('strava_athlete_id', athlete.id);
    }

    await supabaseAdmin.from('strava_connections').upsert(
      { user_id: stravaUserId, ...connectionPayload },
      { onConflict: 'strava_athlete_id' }
    );

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
    });

    if (linkError || !linkData.properties?.hashed_token) {
      return new Response(JSON.stringify({ error: linkError?.message ?? 'Could not create session' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({
        email: userEmail,
        token_hash: linkData.properties.hashed_token,
        strava: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_at,
          athlete,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unexpected error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

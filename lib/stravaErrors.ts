/** Turn Strava / edge-function error payloads into a readable message. */
export function formatStravaError(raw: string): string {
  if (
    raw.includes('strava_connections_strava_athlete_id_key') ||
    raw.includes('already linked to another parcel user')
  ) {
    return 'This Strava account is already linked to another parcel user. Use Continue with Strava on the welcome screen for that Strava account, or disconnect it from the other parcel account first.';
  }

  if (raw.includes('your_secret_from_strava_settings')) {
    return 'STRAVA_CLIENT_SECRET in Supabase secrets is still the placeholder. Set your real secret from strava.com/settings/api.';
  }

  if (/already been registered|already registered/i.test(raw)) {
    return 'Your Strava account is already on Parcel. Log in with your email and password, then connect Strava in Profile → Settings.';
  }

  try {
    const parsed = JSON.parse(raw) as {
      message?: string;
      errors?: { resource?: string; field?: string; code?: string }[];
      error?: string;
    };

    if (parsed.message === 'Authorization Error' || parsed.message === 'Bad Request') {
      const appError = parsed.errors?.find((e) => e.resource === 'Application');
      if (appError?.code === 'invalid') {
        return 'Strava rejected the app credentials. In Supabase → Edge Functions → Secrets, set STRAVA_CLIENT_ID=249513 and STRAVA_CLIENT_SECRET to your real Client Secret from strava.com/settings/api (not the placeholder text). Then redeploy strava-token-exchange and strava-sign-in.';
      }
    }

    if (parsed.error) return parsed.error;
    if (parsed.message) return parsed.message;
  } catch {
    // not JSON — fall through
  }

  if (/already been used|invalid authorization code|code expired/i.test(raw)) {
    return 'Strava authorization expired — tap Connect Strava and try again.';
  }

  if (raw.includes('Bad Request') || raw.includes('bad request')) {
    return 'Strava rejected the request — tap Connect Strava and try again once. If it keeps failing, disconnect and reconnect in Settings.';
  }

  if (raw.includes('Authorization Error')) {
    return 'Strava rejected the app credentials. Check STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET in Supabase Edge Function secrets.';
  }

  return raw;
}

export async function readSupabaseFunctionError(error: {
  message: string;
  context?: Response;
}): Promise<string> {
  let detail = error.message;
  if (error.context instanceof Response) {
    try {
      const body = (await error.context.json()) as { error?: string; detail?: string };
      detail = body.detail ?? body.error ?? detail;
    } catch {
      // keep generic message
    }
  }
  return formatStravaError(detail);
}

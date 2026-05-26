import * as AuthSession from 'expo-auth-session';

import { STRAVA_CLIENT_ID, STRAVA_SCOPES } from '@/lib/strava';

export type StravaOAuthIntent = 'sign_in' | 'connect';

/** Deep link the app listens for after Strava auth completes. */
export function getStravaAppReturnUri(): string {
  const override = process.env.EXPO_PUBLIC_STRAVA_APP_RETURN_URI?.trim();
  if (override) return override;

  return AuthSession.makeRedirectUri({
    scheme: 'parcel',
    path: 'strava-auth',
    native: 'parcel://strava-auth',
  });
}

/**
 * HTTPS callback registered in Strava (Authorization Callback Domain = your-project.supabase.co).
 * Strava rejects exp:// URIs from Expo Go; this edge function bridges back to the app scheme.
 */
export function getStravaOAuthCallbackUrl(): string {
  const override = process.env.EXPO_PUBLIC_STRAVA_REDIRECT_URI?.trim();
  if (override) return override;

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  if (!supabaseUrl) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is required for Strava OAuth');
  }

  return `${supabaseUrl}/functions/v1/strava-oauth-callback`;
}

/** Full redirect_uri passed to Strava (includes intent for the callback bridge). */
export function buildStravaRedirectUri(intent: StravaOAuthIntent): string {
  const params = new URLSearchParams({
    return_uri: getStravaAppReturnUri(),
    intent,
  });
  return `${getStravaOAuthCallbackUrl()}?${params.toString()}`;
}

export function buildStravaAuthorizeUrl(
  redirectUri: string,
  options?: { forceApproval?: boolean }
): string {
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    approval_prompt: options?.forceApproval ? 'force' : 'auto',
    scope: STRAVA_SCOPES,
  });

  return `https://www.strava.com/oauth/mobile/authorize?${params.toString()}`;
}

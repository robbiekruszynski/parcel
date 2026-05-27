import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { runStravaCodeOnce } from '@/lib/exchangeStravaCodeOnce';
import { readSupabaseFunctionError } from '@/lib/stravaErrors';
import { retryQueuedStravaUpload } from '@/lib/stravaUploadQueue';
import {
  buildStravaAuthorizeUrl,
  buildStravaRedirectUri,
  getStravaAppReturnUri,
} from '@/lib/stravaOAuth';
import { STRAVA_CLIENT_ID } from '@/lib/strava';
import { supabase } from '@/lib/supabase';
import { useStravaStore } from '@/stores/stravaStore';

WebBrowser.maybeCompleteAuthSession();

export function useStravaAuth() {
  const setStravaTokens = useStravaStore((s) => s.setStravaTokens);

  const appReturnUri = useMemo(() => getStravaAppReturnUri(), []);
  const stravaRedirectUri = useMemo(() => buildStravaRedirectUri('connect'), []);

  const exchangeCodeForTokens = useCallback(
    async (code: string) => {
      await runStravaCodeOnce(code, async () => {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error('Sign in to parcel before connecting Strava');

        const { data, error } = await supabase.functions.invoke('strava-token-exchange', {
          body: { code, redirect_uri: stravaRedirectUri },
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (error) {
          throw new Error(
            await readSupabaseFunctionError(error as { message: string; context?: Response })
          );
        }
        if (!data?.access_token) throw new Error('Token exchange returned no access token');
        setStravaTokens(data, session.user.id);
        await retryQueuedStravaUpload();
      });
    },
    [stravaRedirectUri, setStravaTokens]
  );

  const connectStrava = useCallback(async () => {
    if (!STRAVA_CLIENT_ID) {
      throw new Error('Add EXPO_PUBLIC_STRAVA_CLIENT_ID to .env and restart Expo.');
    }

    const authUrl = buildStravaAuthorizeUrl(stravaRedirectUri, { forceApproval: true });
    const result = await WebBrowser.openAuthSessionAsync(authUrl, appReturnUri);

    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new Error('Strava authorization was cancelled');
    }

    if (result.type !== 'success') {
      throw new Error('Strava authorization did not complete');
    }

    const parsed = new URL(result.url);
    const error = parsed.searchParams.get('error');
    if (error) {
      throw new Error(`Strava authorization failed: ${error}`);
    }

    const code = parsed.searchParams.get('code');
    if (!code) {
      throw new Error('Strava did not return an authorization code');
    }

    // Hand off to strava-auth — single place that exchanges the code (avoids double exchange).
    router.replace({
      pathname: '/strava-auth',
      params: {
        code,
        intent: parsed.searchParams.get('intent') ?? 'connect',
      },
    });
  }, [appReturnUri, stravaRedirectUri]);

  // ── Sign in WITH Strava (creates / links a parcel account) ──────────────
  const signInWithStrava = useCallback(async () => {
    if (!STRAVA_CLIENT_ID) {
      throw new Error('Add EXPO_PUBLIC_STRAVA_CLIENT_ID to .env and restart Expo.');
    }
    const signInRedirectUri = buildStravaRedirectUri('sign_in');
    const authUrl = buildStravaAuthorizeUrl(signInRedirectUri);
    const result = await WebBrowser.openAuthSessionAsync(authUrl, appReturnUri);
    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new Error('Strava authorisation was cancelled');
    }
    // Deep-link is picked up by app/strava-auth.tsx → completeStravaSignIn.
    // Auth state updates via onAuthStateChange — nothing else needed here.
  }, [appReturnUri]);

  return {
    connectStrava,
    signInWithStrava,
    exchangeCodeForTokens,
    appReturnUri,
    stravaRedirectUri,
  };
}

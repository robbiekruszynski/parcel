import * as WebBrowser from 'expo-web-browser';
import { useCallback, useMemo } from 'react';

import { completeStravaSignIn } from '@/lib/completeStravaSignIn';
import { STRAVA_CLIENT_ID } from '@/lib/strava';
import {
  buildStravaAuthorizeUrl,
  buildStravaRedirectUri,
  getStravaAppReturnUri,
} from '@/lib/stravaOAuth';

WebBrowser.maybeCompleteAuthSession();

export function useStravaSignIn() {
  const appReturnUri = useMemo(() => getStravaAppReturnUri(), []);
  const stravaRedirectUri = useMemo(() => buildStravaRedirectUri('sign_in'), []);

  const signInWithStrava = useCallback(async () => {
    if (!STRAVA_CLIENT_ID) {
      throw new Error('Add EXPO_PUBLIC_STRAVA_CLIENT_ID to .env and restart Expo.');
    }

    const authUrl = buildStravaAuthorizeUrl(stravaRedirectUri);
    const result = await WebBrowser.openAuthSessionAsync(authUrl, appReturnUri);

    if (result.type === 'cancel' || result.type === 'dismiss') {
      throw new Error('Strava sign-in was cancelled');
    }

    if (result.type !== 'success') {
      throw new Error('Strava sign-in did not complete');
    }

    const parsed = new URL(result.url);
    const error = parsed.searchParams.get('error');
    if (error) {
      throw new Error(`Strava sign-in failed: ${error}`);
    }

    const code = parsed.searchParams.get('code');
    if (!code) {
      throw new Error('Strava did not return an authorization code');
    }

    await completeStravaSignIn(code, stravaRedirectUri);
  }, [appReturnUri, stravaRedirectUri]);

  return { signInWithStrava, completeStravaSignInFromCode: completeStravaSignIn, stravaRedirectUri };
}

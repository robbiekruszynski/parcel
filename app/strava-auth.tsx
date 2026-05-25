import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import { completeStravaSignIn } from '@/lib/completeStravaSignIn';
import { buildStravaRedirectUri } from '@/lib/stravaOAuth';
import { useStravaAuth } from '@/hooks/useStravaAuth';

export default function StravaAuthCallbackScreen() {
  const params = useLocalSearchParams<{
    code?: string | string[];
    error?: string | string[];
    intent?: string | string[];
  }>();
  const { exchangeCodeForTokens } = useStravaAuth();
  const handled = useRef(false);
  const [message, setMessage] = useState('Finishing Strava…');

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const code = Array.isArray(params.code) ? params.code[0] : params.code;
    const error = Array.isArray(params.error) ? params.error[0] : params.error;
    const intentRaw = Array.isArray(params.intent) ? params.intent[0] : params.intent;
    const intent = intentRaw === 'connect' ? 'connect' : 'sign_in';

    void (async () => {
      if (error) {
        Alert.alert('Strava failed', error);
        router.replace(intent === 'connect' ? '/settings' : '/(auth)');
        return;
      }

      if (!code) {
        Alert.alert('Strava failed', 'Missing authorization code.');
        router.replace(intent === 'connect' ? '/settings' : '/(auth)');
        return;
      }

      try {
        if (intent === 'connect') {
          await exchangeCodeForTokens(code);
          setMessage('Strava connected');
          router.replace('/settings');
          return;
        }

        await completeStravaSignIn(code, buildStravaRedirectUri('sign_in'));
        setMessage('Signed in with Strava');
        router.replace('/(tabs)/map');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Could not complete Strava auth';
        Alert.alert(intent === 'connect' ? 'Strava connection failed' : 'Strava sign-in failed', msg);
        router.replace(intent === 'connect' ? '/settings' : '/(auth)');
      }
    })();
  }, [exchangeCodeForTokens, params.code, params.error, params.intent]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0e0e10' }}>
      <ActivityIndicator color="#FC4C02" />
      <Text style={{ marginTop: 16, color: '#fff', fontFamily: 'Rajdhani_600SemiBold', fontSize: 15 }}>
        {message}
      </Text>
    </View>
  );
}

import { router } from 'expo-router';
import { useURL } from 'expo-linking';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';

import { createSessionFromUrl } from '@/lib/authLinking';

export default function AuthCallbackScreen() {
  const url = useURL();
  const [message, setMessage] = useState('Confirming your email…');

  useEffect(() => {
    if (!url) return;

    void (async () => {
      try {
        await createSessionFromUrl(url);
        router.replace('/(tabs)');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Could not confirm email';
        setMessage(msg);
        Alert.alert('Email confirmation failed', msg, [
          { text: 'Sign in', onPress: () => router.replace('/(auth)/sign-in') },
        ]);
      }
    })();
  }, [url]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0e0e10', paddingHorizontal: 32 }}>
      <ActivityIndicator size="large" color="#f5c518" />
      <Text style={{ marginTop: 24, textAlign: 'center', fontSize: 15, color: 'rgba(255,255,255,0.65)', fontFamily: 'Rajdhani_600SemiBold' }}>
        {message}
      </Text>
    </View>
  );
}

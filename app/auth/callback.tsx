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
    <View className="flex-1 items-center justify-center bg-parcel-bg-dark px-8">
      <ActivityIndicator size="large" color="#f5c518" />
      <Text className="mt-6 text-center text-base text-white/70">{message}</Text>
    </View>
  );
}

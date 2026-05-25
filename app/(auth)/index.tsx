import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { useStravaAuth } from '@/hooks/useStravaAuth';

export default function HeroScreen() {
  const { signInWithStrava } = useStravaAuth();
  const [stravaBusy, setStravaBusy] = useState(false);

  const onStravaSignIn = async () => {
    setStravaBusy(true);
    try {
      await signInWithStrava();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Strava sign-in failed';
      Alert.alert('Strava sign-in failed', msg);
    } finally {
      setStravaBusy(false);
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-parcel-bg-dark px-8">
      <Text
        className="mb-2 text-center text-6xl text-white"
        style={{ fontFamily: 'Syne_800ExtraBold', letterSpacing: -1 }}>
        parcel
      </Text>
      <Text
        className="mb-14 text-center text-base text-white/60"
        style={{ fontFamily: 'DMMono_400Regular' }}>
        claim your city
      </Text>

      {/* Email sign in */}
      <Pressable
        className="mb-3 w-full max-w-sm rounded-xl bg-white py-4"
        onPress={() => router.push('/(auth)/sign-in')}>
        <Text className="text-center text-base font-semibold text-parcel-bg-dark">
          Sign in
        </Text>
      </Pressable>

      {/* Create account */}
      <Pressable
        className="mb-4 w-full max-w-sm rounded-xl border border-white/25 bg-transparent py-4"
        onPress={() => router.push('/(auth)/register')}>
        <Text className="text-center text-base font-semibold text-white">
          Create account
        </Text>
      </Pressable>

      {/* Divider */}
      <View className="mb-4 w-full max-w-sm flex-row items-center gap-3">
        <View className="h-px flex-1 bg-white/15" />
        <Text className="text-xs text-white/35" style={{ fontFamily: 'DMMono_400Regular' }}>
          or
        </Text>
        <View className="h-px flex-1 bg-white/15" />
      </View>

      {/* Continue with Strava */}
      <Pressable
        className="w-full max-w-sm flex-row items-center justify-center gap-2 rounded-xl py-4"
        style={{ backgroundColor: '#FC4C02' }}
        onPress={() => void onStravaSignIn()}
        disabled={stravaBusy}>
        {stravaBusy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-center text-base font-bold text-white">
            Continue with Strava
          </Text>
        )}
      </Pressable>
    </View>
  );
}

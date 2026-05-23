import { useFocusEffect } from 'expo-router';
import React, { useCallback } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, Text, View } from 'react-native';

import { useAuth } from '@/components/AuthProvider';
import { useStravaAuth } from '@/hooks/useStravaAuth';
import { STRAVA_CLIENT_ID } from '@/lib/strava';
import { disconnectStravaForCurrentUser } from '@/lib/disconnectStrava';
import { syncStravaConnectionForUser } from '@/lib/syncStravaConnection';
import { useStravaStore } from '@/stores/stravaStore';

export function StravaConnectButton() {
  const { user } = useAuth();
  const { connectStrava, stravaRedirectUri } = useStravaAuth();
  const isConnected = useStravaStore((s) => s.isConnected);
  const athlete = useStravaStore((s) => s.athlete);
  const syncedUserId = useStravaStore((s) => s.syncedUserId);
  const syncReady = useStravaStore((s) => s.syncReady);
  const [busy, setBusy] = React.useState(false);

  useFocusEffect(
    useCallback(() => {
      void syncStravaConnectionForUser(user?.id ?? null);
    }, [user?.id])
  );

  const linkedToCurrentUser = Boolean(
    user?.id && syncReady && isConnected && athlete && syncedUserId === user.id
  );

  const onConnect = () => {
    if (!STRAVA_CLIENT_ID) {
      Alert.alert(
        'Strava not configured',
        'Add EXPO_PUBLIC_STRAVA_CLIENT_ID to .env and restart Expo.'
      );
      return;
    }

    setBusy(true);
    void connectStrava()
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Could not connect Strava';
        Alert.alert('Strava connection failed', msg);
      })
      .finally(() => setBusy(false));
  };

  const onDisconnect = () => {
    Alert.alert('Disconnect Strava', 'Stop importing activities from Strava?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(true);
            try {
              await disconnectStravaForCurrentUser();
            } catch (e: unknown) {
              const msg = e instanceof Error ? e.message : 'Could not disconnect';
              Alert.alert('Disconnect failed', msg);
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  if (!syncReady) {
    return (
      <View className="flex-row items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <ActivityIndicator color="#fb923c" />
        <Text className="text-sm text-white/50">Checking Strava connection…</Text>
      </View>
    );
  }

  if (linkedToCurrentUser && athlete) {
    return (
      <View className="flex-row items-center gap-3 rounded-xl border border-orange-500/30 bg-orange-500/10 p-4">
        {athlete.profile ? (
          <Image source={{ uri: athlete.profile }} className="h-10 w-10 rounded-full" />
        ) : (
          <View className="h-10 w-10 rounded-full bg-orange-500/30" />
        )}
        <View className="flex-1">
          <Text className="font-semibold text-white">
            {athlete.firstname} {athlete.lastname}
          </Text>
          <Text className="text-sm text-orange-400">Strava connected</Text>
        </View>
        <Pressable
          onPress={onDisconnect}
          disabled={busy}
          className="rounded-lg bg-red-500/20 px-3 py-1">
          {busy ? (
            <ActivityIndicator size="small" color="#f87171" />
          ) : (
            <Text className="text-sm text-red-400">Disconnect</Text>
          )}
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <Pressable
        onPress={onConnect}
        disabled={busy}
        className="flex-row items-center justify-center gap-2 rounded-xl bg-orange-500 p-4">
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text className="text-base font-bold text-white">Connect Strava</Text>
        )}
      </Pressable>
      {__DEV__ && stravaRedirectUri ? (
        <Text className="mt-2 text-xs leading-5 text-white/35" style={{ fontFamily: 'DMMono_400Regular' }}>
          Strava callback domain: hejysfrfdcjzpwxnvotn.supabase.co
        </Text>
      ) : null}
    </View>
  );
}

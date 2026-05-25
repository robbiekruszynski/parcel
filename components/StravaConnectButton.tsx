import { useFocusEffect } from 'expo-router';
import React, { useCallback } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/components/AuthProvider';
import { useStravaAuth } from '@/hooks/useStravaAuth';
import { STRAVA_CLIENT_ID } from '@/lib/strava';
import { disconnectStravaForCurrentUser } from '@/lib/disconnectStrava';
import { syncStravaConnectionForUser } from '@/lib/syncStravaConnection';
import { useStravaStore } from '@/stores/stravaStore';

export function StravaConnectButton() {
  const { user } = useAuth();
  const { connectStrava, stravaRedirectUri } = useStravaAuth();
  const isConnected  = useStravaStore((s) => s.isConnected);
  const athlete      = useStravaStore((s) => s.athlete);
  const syncedUserId = useStravaStore((s) => s.syncedUserId);
  const syncReady    = useStravaStore((s) => s.syncReady);
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

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (!syncReady) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator color="#FC4C02" />
        <Text style={styles.loadingText}>Checking Strava connection…</Text>
      </View>
    );
  }

  // ── Connected ────────────────────────────────────────────────────────────────
  if (linkedToCurrentUser && athlete) {
    return (
      <View style={styles.connectedRow}>
        {athlete.profile ? (
          <Image source={{ uri: athlete.profile }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder} />
        )}
        <View style={styles.connectedInfo}>
          <Text style={styles.athleteName}>
            {athlete.firstname} {athlete.lastname}
          </Text>
          <Text style={styles.connectedLabel}>Strava connected</Text>
        </View>
        <Pressable
          onPress={onDisconnect}
          disabled={busy}
          style={({ pressed }) => [styles.disconnectBtn, pressed && { opacity: 0.75 }]}>
          {busy
            ? <ActivityIndicator size="small" color="#f87171" />
            : <Text style={styles.disconnectTxt}>Disconnect</Text>}
        </Pressable>
      </View>
    );
  }

  // ── Not connected ────────────────────────────────────────────────────────────
  return (
    <View>
      <Pressable
        onPress={onConnect}
        disabled={busy}
        style={({ pressed }) => [styles.connectBtn, pressed && { opacity: 0.85 }]}>
        {busy
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.connectTxt}>Connect Strava</Text>}
      </Pressable>
      {__DEV__ && stravaRedirectUri ? (
        <Text style={styles.devHint}>
          Strava callback domain: hejysfrfdcjzpwxnvotn.supabase.co
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Loading state
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
  },
  loadingText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'Rajdhani_600SemiBold',
  },

  // Connected state
  connectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(252,76,2,0.3)',
    backgroundColor: 'rgba(252,76,2,0.1)',
    padding: 16,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(252,76,2,0.3)',
  },
  connectedInfo: {
    flex: 1,
  },
  athleteName: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontWeight: '600',
    fontSize: 15,
    color: '#ffffff',
    marginBottom: 2,
  },
  connectedLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: '#FC4C02',
  },
  disconnectBtn: {
    backgroundColor: 'rgba(248,113,113,0.15)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  disconnectTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: '#f87171',
  },

  // Not connected state
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    backgroundColor: '#FC4C02',
    padding: 16,
  },
  connectTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  devHint: {
    fontFamily: 'DMMono_400Regular',
    marginTop: 8,
    fontSize: 11,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.35)',
  },
});

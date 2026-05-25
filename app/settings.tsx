/**
 * settings.tsx
 *
 * Full settings screen — accessible via Profile > Settings.
 * Covers: Strava integration, account info, sign out.
 */

import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/components/AuthProvider';
import { StravaConnectButton } from '@/components/StravaConnectButton';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  const onSignOut = () => {
    Alert.alert('Sign out', 'Leave this account on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void signOut().catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : 'Could not sign out';
            Alert.alert('Sign out failed', msg);
          });
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 14) }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <FontAwesome name="chevron-left" size={14} color="#f5c518" />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Account info */}
        {user?.email ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>ACCOUNT</Text>
            <View style={styles.card}>
              <MaterialCommunityIcons name="account-circle-outline" size={18} color="rgba(255,255,255,0.4)" />
              <Text style={styles.emailText}>{user.email}</Text>
            </View>
          </View>
        ) : null}

        {/* Strava integration */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ACTIVITY SYNC</Text>
          <View style={styles.stravaNote}>
            <MaterialCommunityIcons name="information-outline" size={14} color="rgba(255,255,255,0.35)" style={{ marginRight: 6 }} />
            <Text style={styles.stravaNoteText}>
              Connect Strava to automatically upload every walk, run, cycle, or skate session after you claim a parcel.
            </Text>
          </View>
          <StravaConnectButton />
        </View>

        {/* Sign out */}
        <View style={styles.section}>
          <Pressable style={styles.signOutBtn} onPress={onSignOut}>
            <FontAwesome name="sign-out" size={15} color="#ef4444" style={{ marginRight: 10 }} />
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const AMBER   = '#f5c518';
const BG      = '#0e0e10';
const CARD_BG = '#13131a';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 26,
    color: '#fff',
    letterSpacing: 0.4,
  },
  content: {
    padding: 18,
    paddingBottom: 60,
    gap: 28,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 10,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  emailText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
  },
  stravaNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  stravaNoteText: {
    flex: 1,
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    lineHeight: 18,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
  },
  signOutText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: '#ef4444',
  },
});

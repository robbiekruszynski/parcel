import { MaterialCommunityIcons } from '@expo/vector-icons';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useAuth } from '@/components/AuthProvider';
import { StravaConnectButton } from '@/components/StravaConnectButton';
import { formatAreaM2 } from '@/lib/parcelGeometry';
import { supabase } from '@/lib/supabase';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Profile {
  username: string | null;
  display_name: string | null;
  points_total: number;
  points_balance: number;
}

interface UserParcel {
  id: string;
  area_sqm: number;
  claimed_at: string;
  color: string;
  points: number;
  activity: string;
}

type ActivityIconName =
  | 'walk'
  | 'run'
  | 'bike'
  | 'rollerblade'
  | 'map-marker-path';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function activityIcon(activity: string): ActivityIconName {
  switch (activity) {
    case 'walking':       return 'walk';
    case 'running':       return 'run';
    case 'cycling':       return 'bike';
    case 'rollerblading': return 'rollerblade';
    default:              return 'map-marker-path';
  }
}

function activityLabel(activity: string): string {
  switch (activity) {
    case 'walking':       return 'Walk';
    case 'running':       return 'Run';
    case 'cycling':       return 'Cycle';
    case 'rollerblading': return 'Rollerblade';
    default:              return activity;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function initials(profile: Profile | null): string {
  if (!profile) return '?';
  const name = profile.display_name ?? profile.username ?? '';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return '?';
}

// ─── Parcel Card ───────────────────────────────────────────────────────────────

function ParcelCard({ parcel }: { parcel: UserParcel }) {
  const icon = activityIcon(parcel.activity);

  return (
    <View style={styles.card}>
      <View style={[styles.swatch, { backgroundColor: parcel.color }]} />
      <View style={styles.cardBody}>
        <Text style={styles.areaText}>{formatAreaM2(parcel.area_sqm)}</Text>
        <View style={styles.cardRow}>
          <MaterialCommunityIcons
            name={icon}
            size={14}
            color="#9ca3af"
            style={{ marginRight: 4 }}
          />
          <Text style={styles.activityText}>{activityLabel(parcel.activity)}</Text>
          <Text style={styles.pointsText}>{parcel.points} pts</Text>
        </View>
        <Text style={styles.dateText}>{formatDate(parcel.claimed_at)}</Text>
      </View>
    </View>
  );
}

// ─── Settings footer ───────────────────────────────────────────────────────────

function SettingsFooter({ onSignOut }: { onSignOut: () => void }) {
  return (
    <View style={styles.settingsSection}>
      {/* Section label */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>SETTINGS</Text>
      </View>

      {/* Strava connect */}
      <View style={styles.settingsGroup}>
        <View style={styles.settingsRow}>
          <FontAwesome name="heartbeat" size={16} color="#fb923c" style={{ marginRight: 10 }} />
          <Text style={styles.settingsRowLabel}>Strava</Text>
        </View>
        <View style={{ marginTop: 10 }}>
          <StravaConnectButton />
        </View>
      </View>

      {/* More settings link */}
      <Pressable
        style={styles.settingsLinkRow}
        onPress={() => router.push('/settings')}>
        <FontAwesome name="sliders" size={15} color="rgba(255,255,255,0.5)" style={{ marginRight: 10 }} />
        <Text style={styles.settingsLinkText}>More settings</Text>
        <FontAwesome name="chevron-right" size={12} color="rgba(255,255,255,0.2)" style={{ marginLeft: 'auto' }} />
      </Pressable>

      {/* Sign out */}
      <Pressable style={styles.signOutBtn} onPress={onSignOut}>
        <FontAwesome name="sign-out" size={15} color="#ef4444" style={{ marginRight: 10 }} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [parcels, setParcels] = useState<UserParcel[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setProfile(null);
        setParcels([]);
        return;
      }

      const uid = session.user.id;

      const [profileResult, parcelsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('username, display_name, points_total, points_balance')
          .eq('id', uid)
          .single(),
        supabase
          .from('parcels')
          .select('id, area_sqm, claimed_at, color, points, activity')
          .eq('owner_id', uid)
          .order('claimed_at', { ascending: false }),
      ]);

      if (profileResult.error) {
        if (__DEV__) console.warn('[profile] profile fetch:', profileResult.error.message);
      } else {
        setProfile(profileResult.data as Profile);
      }

      if (parcelsResult.error) {
        if (__DEV__) console.warn('[profile] parcels fetch:', parcelsResult.error.message);
      } else {
        setParcels((parcelsResult.data ?? []) as UserParcel[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => { void load(); }, [load])
  );

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Sign out of parcel on this device?', [
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

  const displayUsername = profile?.username ? `@${profile.username}` : '@—';
  const displayName = profile?.display_name ?? '';
  const totalPts = profile?.points_total ?? 0;
  const balance = profile?.points_balance ?? 0;

  return (
    <SafeAreaView style={styles.root}>
      <FlatList
        data={parcels}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void load()}
            tintColor="#f5c518"
          />
        }
        ListHeaderComponent={
          <>
            {/* ── Header ── */}
            <View style={styles.headerRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(profile)}</Text>
              </View>
              <View style={styles.nameBlock}>
                <Text style={styles.usernameText}>{displayUsername}</Text>
                {displayName ? (
                  <Text style={styles.displayNameText}>{displayName}</Text>
                ) : null}
              </View>
            </View>

            {/* ── Stats row ── */}
            <View style={styles.statsRow}>
              <View style={styles.statCell}>
                <Text style={styles.statNumber}>{totalPts.toLocaleString()}</Text>
                <Text style={styles.statLabel}>TOTAL PTS</Text>
              </View>
              <View style={[styles.statCell, styles.statCellBorder]}>
                <Text style={styles.statNumber}>{parcels.length}</Text>
                <Text style={styles.statLabel}>PARCELS</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statNumber}>{balance.toLocaleString()}</Text>
                <Text style={styles.statLabel}>BALANCE</Text>
              </View>
            </View>

            {/* ── Section header ── */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>MY PARCELS</Text>
            </View>
          </>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color="#f5c518" style={{ marginTop: 32 }} />
          ) : (
            <Text style={styles.emptyText}>
              No parcels yet — head to the map and start walking.
            </Text>
          )
        }
        ListFooterComponent={<SettingsFooter onSignOut={handleSignOut} />}
        renderItem={({ item }) => <ParcelCard parcel={item} />}
      />
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const AMBER = '#f5c518';
const BG = '#0e0e10';
const CARD_BG = '#13131a';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    gap: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: AMBER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 22,
    color: '#0e0e10',
    lineHeight: 26,
  },
  nameBlock: {
    flex: 1,
  },
  usernameText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 18,
    color: '#f3f4f6',
  },
  displayNameText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: '#9ca3af',
    marginTop: 2,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    borderRadius: 12,
    marginBottom: 20,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
  },
  statCellBorder: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: '#ffffff18',
  },
  statNumber: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 22,
    color: AMBER,
    lineHeight: 26,
  },
  statLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: '#6b7280',
    marginTop: 2,
  },

  // Section header
  sectionHeader: {
    paddingBottom: 6,
    marginBottom: 4,
  },
  sectionHeaderText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    letterSpacing: 2,
    color: '#6b7280',
    textTransform: 'uppercase',
  },

  // Parcel card
  card: {
    flexDirection: 'row',
    backgroundColor: CARD_BG,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#ffffff0f',
  },
  swatch: {
    width: 4,
  },
  cardBody: {
    flex: 1,
    padding: 12,
    gap: 3,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  areaText: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 18,
    color: '#f3f4f6',
    lineHeight: 22,
  },
  activityText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 12,
    color: '#9ca3af',
    flex: 1,
  },
  pointsText: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 13,
    color: AMBER,
  },
  dateText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    color: '#6b7280',
  },

  // Settings section
  settingsSection: {
    marginTop: 28,
  },
  settingsGroup: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ffffff0f',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsRowLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: '#f3f4f6',
  },
  settingsLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#ffffff0f',
  },
  settingsLinkText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    marginTop: 4,
  },
  signOutText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: '#ef4444',
  },

  // Empty state
  emptyText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
});

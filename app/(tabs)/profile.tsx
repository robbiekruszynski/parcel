import { MaterialCommunityIcons } from '@expo/vector-icons';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';

import { useAuth } from '@/components/AuthProvider';
import { StravaConnectButton } from '@/components/StravaConnectButton';
import { formatAreaM2, formatDistanceM } from '@/lib/parcelGeometry';
import { supabase } from '@/lib/supabase';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

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
  coordinates: [number, number][] | null;
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
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

/** Haversine distance (metres) between two [lat, lng] points. */
function haversine(a: [number, number], b: [number, number]): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const sinL = Math.sin(dLat / 2);
  const sinG = Math.sin(dLng / 2);
  const c = sinL * sinL + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * sinG * sinG;
  return R * 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
}

function routeDistance(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let d = 0;
  for (let i = 1; i < coords.length; i++) d += haversine(coords[i - 1], coords[i]);
  return d;
}

function initials(profile: Profile | null): string {
  if (!profile) return '?';
  const name = profile.display_name ?? profile.username ?? '';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();
  return '?';
}

// ─── Detail row (used in expanded section) ────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// ─── Parcel Card ───────────────────────────────────────────────────────────────

function ParcelCard({
  parcel,
  expanded,
  onToggle,
}: {
  parcel: UserParcel;
  expanded: boolean;
  onToggle: () => void;
}) {
  const icon     = activityIcon(parcel.activity);
  const distance = parcel.coordinates ? routeDistance(parcel.coordinates) : 0;

  return (
    <Pressable onPress={onToggle} style={styles.card}>
      <View style={[styles.swatch, { backgroundColor: parcel.color }]} />
      <View style={styles.cardBody}>
        {/* Top row: area | activity | pts | chevron */}
        <View style={styles.cardRow}>
          <Text style={styles.areaText}>{formatAreaM2(parcel.area_sqm)}</Text>
          <MaterialCommunityIcons
            name={icon}
            size={14}
            color="#9ca3af"
            style={{ marginRight: 3 }}
          />
          <Text style={styles.activityText}>{activityLabel(parcel.activity)}</Text>
          <Text style={styles.pointsText}>{parcel.points} pts</Text>
          <MaterialCommunityIcons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color="rgba(255,255,255,0.3)"
          />
        </View>

        <Text style={styles.dateText}>{formatDate(parcel.claimed_at)}</Text>

        {/* Expanded detail section */}
        {expanded && (
          <View style={styles.expandedSection}>
            <View style={styles.expandedDivider} />
            <DetailRow
              label="CLAIMED"
              value={`${formatDate(parcel.claimed_at)} · ${formatTime(parcel.claimed_at)}`}
            />
            <DetailRow
              label="AREA"
              value={formatAreaM2(parcel.area_sqm)}
            />
            {distance > 0 && (
              <DetailRow label="DISTANCE" value={formatDistanceM(distance)} />
            )}
            <DetailRow
              label="ACTIVITY"
              value={activityLabel(parcel.activity)}
            />
            <DetailRow
              label="POINTS"
              value={`${parcel.points} pts (ticking every 5 min)`}
            />
            <Pressable
              style={styles.viewRouteBtn}
              onPress={() => router.push(`/parcel/${parcel.id}`)}>
              <MaterialCommunityIcons
                name="map-outline"
                size={14}
                color={AMBER}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.viewRouteBtnText}>VIEW ROUTE ON MAP</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── Settings footer ───────────────────────────────────────────────────────────

function SettingsFooter() {
  return (
    <View style={styles.settingsSection}>
      {/* Section label */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>SETTINGS</Text>
      </View>

      {/* Strava / Activity sync */}
      <View style={styles.settingsGroup}>
        <View style={styles.settingsRow}>
          <FontAwesome name="heartbeat" size={16} color="#fb923c" style={{ marginRight: 10 }} />
          <Text style={styles.settingsRowLabel}>Activity Sync</Text>
          <Text style={styles.settingsRowSub}> · Strava</Text>
        </View>
        <Text style={styles.settingsRowHint}>
          Auto-upload every session after you claim a parcel.
        </Text>
        <View style={{ marginTop: 12 }}>
          <StravaConnectButton />
        </View>
      </View>

      {/* Settings link */}
      <Pressable
        style={styles.settingsLinkRow}
        onPress={() => router.push('/settings')}>
        <FontAwesome name="sliders" size={15} color="rgba(255,255,255,0.5)" style={{ marginRight: 10 }} />
        <Text style={styles.settingsLinkText}>Account &amp; settings</Text>
        <FontAwesome name="chevron-right" size={12} color="rgba(255,255,255,0.2)" style={{ marginLeft: 'auto' }} />
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
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
          .select('id, area_sqm, claimed_at, color, points, activity, coordinates')
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

  const toggleParcel = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId((prev) => (prev === id ? null : id));
  };

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
        ListFooterComponent={<SettingsFooter />}
        renderItem={({ item }) => (
          <ParcelCard
            parcel={item}
            expanded={expandedId === item.id}
            onToggle={() => toggleParcel(item.id)}
          />
        )}
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
    gap: 6,
  },
  areaText: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 18,
    color: '#f3f4f6',
    lineHeight: 22,
    flex: 1,
  },
  activityText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 12,
    color: '#9ca3af',
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

  // Expanded section
  expandedSection: { marginTop: 10 },
  expandedDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginBottom: 10,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 10,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.35)',
    textTransform: 'uppercase',
  },
  detailValue: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  viewRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(245,197,24,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.25)',
  },
  viewRouteBtnText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.5,
    color: AMBER,
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
  settingsRowSub: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.35)',
  },
  settingsRowHint: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 4,
    lineHeight: 17,
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

/**
 * PlayerProfileSheet.tsx
 *
 * Bottom-sheet public player profile. Tap any username in the Rankings or
 * Group screens to open it.
 *
 * Shows:
 *  - Avatar / display name / @username / member-since
 *  - Points total + total parcels claimed
 *  - Activity breakdown (walk / run / cycle / skate)
 *  - Last 5 parcels with area, pts, activity icon, date
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatAreaM2 } from '@/lib/parcelGeometry';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  username: string | null;
  display_name: string | null;
  points_total: number;
  created_at: string;
}

interface ParcelSnap {
  activity: string;
  area_sqm: number;
  points: number;
  claimed_at: string;
}

interface PlayerData {
  profile: Profile;
  recentParcels: ParcelSnap[];
  totalParcels: number;
  activityCounts: Record<string, number>;
  totalAreaM2: number;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface PlayerProfileSheetProps {
  userId: string | null;       // null = hidden
  myUserId?: string | null;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(profile: Profile): string {
  const n = profile.display_name ?? profile.username ?? '';
  const parts = n.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts[0]?.length) return parts[0].slice(0, 2).toUpperCase();
  return '??';
}

function formatMemberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'long',
    year:  'numeric',
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day:   'numeric',
  });
}

const ACTIVITY_META: Record<
  string,
  { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; label: string; color: string }
> = {
  walking:       { icon: 'walk',        label: 'Walk',   color: '#34d399' },
  running:       { icon: 'run',         label: 'Run',    color: '#f5c518' },
  cycling:       { icon: 'bike',        label: 'Cycle',  color: '#60a5fa' },
  rollerblading: { icon: 'rollerblade', label: 'Skate',  color: '#f472b6' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function PlayerProfileSheet({ userId, myUserId, onClose }: PlayerProfileSheetProps) {
  const insets = useSafeAreaInsets();
  const [data, setData]     = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const isMe = !!userId && userId === myUserId;

  useEffect(() => {
    if (!userId) { setData(null); setError(null); return; }
    void fetch(userId);
  }, [userId]);

  const fetch = async (uid: string) => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, parcelsRes, countRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, display_name, points_total, created_at')
          .eq('id', uid)
          .single(),
        supabase
          .from('parcels')
          .select('activity, area_sqm, points, claimed_at')
          .eq('owner_id', uid)
          .order('claimed_at', { ascending: false })
          .limit(50),
        supabase
          .from('parcels')
          .select('*', { count: 'exact', head: true })
          .eq('owner_id', uid),
      ]);

      if (profileRes.error || !profileRes.data) {
        setError('Player not found');
        return;
      }

      const parcels = (parcelsRes.data ?? []) as ParcelSnap[];
      const activityCounts: Record<string, number> = {};
      let totalAreaM2 = 0;
      for (const p of parcels) {
        activityCounts[p.activity] = (activityCounts[p.activity] ?? 0) + 1;
        totalAreaM2 += p.area_sqm ?? 0;
      }

      setData({
        profile:       profileRes.data as Profile,
        recentParcels: parcels.slice(0, 5),
        totalParcels:  countRes.count ?? parcels.length,
        activityCounts,
        totalAreaM2,
      });
    } catch {
      setError('Could not load profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={userId !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 28) }]}>

          <View style={styles.handle} />

          {loading || !data ? (
            <View style={styles.center}>
              {loading
                ? <ActivityIndicator color="#f5c518" size="large" />
                : <Text style={styles.errorTxt}>{error ?? 'No data'}</Text>}
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* ── Header ── */}
              <View style={styles.profileHeader}>
                <View style={[styles.avatar, isMe && styles.avatarMe]}>
                  <Text style={[styles.avatarTxt, isMe && styles.avatarTxtMe]}>
                    {initials(data.profile)}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  {data.profile.display_name ? (
                    <Text style={styles.displayName}>{data.profile.display_name}</Text>
                  ) : null}
                  <Text style={[styles.username, isMe && { color: '#f5c518' }]}>
                    @{data.profile.username ?? 'unknown'}
                    {isMe ? '  (you)' : ''}
                  </Text>
                  <Text style={styles.memberSince}>
                    Member since {formatMemberSince(data.profile.created_at)}
                  </Text>
                </View>
              </View>

              {/* ── Key stats ── */}
              <View style={styles.statsRow}>
                <StatCell
                  label="POINTS"
                  value={data.profile.points_total.toLocaleString()}
                  accent
                />
                <View style={styles.statDivider} />
                <StatCell
                  label="PARCELS"
                  value={data.totalParcels.toLocaleString()}
                />
                <View style={styles.statDivider} />
                <StatCell
                  label="TERRITORY"
                  value={formatAreaM2(data.totalAreaM2)}
                />
              </View>

              {/* ── Activity breakdown ── */}
              {Object.keys(data.activityCounts).length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>ACTIVITY</Text>
                  <View style={styles.activityRow}>
                    {Object.entries(ACTIVITY_META).map(([key, meta]) => {
                      const count = data.activityCounts[key] ?? 0;
                      if (count === 0) return null;
                      return (
                        <View key={key} style={styles.activityCell}>
                          <View style={[styles.activityIcon, { backgroundColor: meta.color + '1a' }]}>
                            <MaterialCommunityIcons name={meta.icon} size={18} color={meta.color} />
                          </View>
                          <Text style={styles.activityCount}>{count}</Text>
                          <Text style={styles.activityLabel}>{meta.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* ── Recent parcels ── */}
              {data.recentParcels.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>RECENT PARCELS</Text>
                  {data.recentParcels.map((p, i) => {
                    const meta = ACTIVITY_META[p.activity] ?? ACTIVITY_META.walking;
                    return (
                      <View key={i} style={styles.parcelRow}>
                        <View style={[styles.parcelIcon, { backgroundColor: meta.color + '18' }]}>
                          <MaterialCommunityIcons name={meta.icon} size={14} color={meta.color} />
                        </View>
                        <Text style={styles.parcelArea}>{formatAreaM2(p.area_sqm)}</Text>
                        <Text style={styles.parcelPts}>+{p.points} pts</Text>
                        <Text style={styles.parcelDate}>{formatDate(p.claimed_at)}</Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {data.recentParcels.length === 0 && (
                <View style={styles.emptyParcels}>
                  <MaterialCommunityIcons name="map-marker-off-outline" size={28} color="rgba(255,255,255,0.15)" />
                  <Text style={styles.emptyTxt}>No parcels claimed yet</Text>
                </View>
              )}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCell({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, accent && { color: '#f5c518' }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#13131a',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    maxHeight: '88%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
    marginBottom: 22,
  },
  center: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  errorTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.3)',
  },

  // Profile header
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 22,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarMe: { backgroundColor: '#f5c518' },
  avatarTxt: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 20,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 24,
  },
  avatarTxtMe: { color: '#0e0e10' },
  displayName: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 22,
    color: '#fff',
    letterSpacing: 0.3,
  },
  username: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },
  memberSince: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.28)',
    marginTop: 3,
    letterSpacing: 0.3,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    paddingVertical: 16,
    marginBottom: 22,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 22,
    color: '#fff',
    lineHeight: 26,
  },
  statLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 9,
    letterSpacing: 1.5,
    color: 'rgba(255,255,255,0.3)',
    textTransform: 'uppercase',
    marginTop: 3,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 4,
  },

  // Sections
  section: {
    marginBottom: 22,
  },
  sectionLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 10,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.3)',
    marginBottom: 10,
  },

  // Activity breakdown
  activityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  activityCell: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  activityIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityCount: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 18,
    color: '#fff',
    lineHeight: 21,
  },
  activityLabel: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 10,
    color: 'rgba(255,255,255,0.35)',
    letterSpacing: 0.5,
  },

  // Recent parcels
  parcelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  parcelIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  parcelArea: {
    fontFamily: 'BarlowCondensed_900Black',
    fontSize: 15,
    color: '#fff',
    flex: 1,
  },
  parcelPts: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 12,
    color: '#f5c518',
  },
  parcelDate: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
  },

  // Empty
  emptyParcels: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.25)',
  },
});

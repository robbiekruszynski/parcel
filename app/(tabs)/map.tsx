/**
 * map.tsx — Main map screen
 *
 * The activity selector at the top serves dual purpose:
 *  1. Filters which parcels are shown (each activity is its own competition layer)
 *  2. Tags any new recording with that activity type
 *
 * Locked during an active session — can't switch layers mid-recording.
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ParcelMap } from '@/components/ParcelMap';
import { ParcelRecordingOverlay } from '@/components/ParcelRecordingOverlay';
import { useParcelTracking, type ActivityType } from '@/hooks/useParcelTracking';

// ─── Constants ────────────────────────────────────────────────────────────────

const AMBER = '#f5c518';
const FONT  = 'Rajdhani_600SemiBold';

const ACTIVITY_TABS: {
  id: ActivityType;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  label: string;
}[] = [
  { id: 'walking',      icon: 'walk',        label: 'Walk'  },
  { id: 'running',      icon: 'run',         label: 'Run'   },
  { id: 'cycling',      icon: 'bike',        label: 'Cycle' },
  { id: 'rollerblading', icon: 'rollerblade', label: 'Skate' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const [activityType, setActivityType] = useState<ActivityType>('walking');

  const {
    isTracking,
    isPaused,
    loopClosed,
    distanceM,
    areaM2,
    startTracking,
    pauseTracking,
    resumeTracking,
    stopTracking,
    claimParcel,
  } = useParcelTracking(activityType);

  const activityLocked = isTracking || isPaused;

  return (
    <View style={StyleSheet.absoluteFillObject}>
      {/* ── Full-screen map — filtered to selected activity layer ────────── */}
      <ParcelMap activityFilter={activityType} />

      {/* ── Activity / layer selector ─────────────────────────────────────── */}
      <View
        pointerEvents="box-none"
        style={[styles.selectorWrap, { top: insets.top + 12 }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.selectorInner}>
          {ACTIVITY_TABS.map((tab) => {
            const active  = activityType === tab.id;
            const dimmed  = activityLocked && !active;
            return (
              <Pressable
                key={tab.id}
                onPress={() => { if (!activityLocked) setActivityType(tab.id); }}
                disabled={activityLocked && !active}
                style={[
                  styles.tab,
                  active  && styles.tabActive,
                  dimmed  && styles.tabDimmed,
                ]}>
                <MaterialCommunityIcons
                  name={tab.icon}
                  size={16}
                  color={active ? '#0e0e10' : 'rgba(255,255,255,0.55)'}
                />
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
                {/* dot indicator when this layer has parcels */}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Recording overlay ─────────────────────────────────────────────── */}
      <ParcelRecordingOverlay
        isTracking={isTracking}
        isPaused={isPaused}
        loopClosed={loopClosed}
        distanceM={distanceM}
        areaM2={areaM2}
        onStart={startTracking}
        onPause={pauseTracking}
        onResume={resumeTracking}
        onStop={stopTracking}
        onClaim={claimParcel}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  selectorWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  selectorInner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(14,14,16,0.9)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 4,
    gap: 2,
    paddingHorizontal: 6,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
  },
  tabActive: {
    backgroundColor: AMBER,
  },
  tabDimmed: {
    opacity: 0.3,
  },
  tabLabel: {
    fontFamily: FONT,
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.5,
  },
  tabLabelActive: {
    color: '#0e0e10',
    fontWeight: '700',
  },
});

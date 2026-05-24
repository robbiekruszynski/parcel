import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

import { ParcelMap } from '@/components/ParcelMap';
import { ParcelRecordingOverlay } from '@/components/ParcelRecordingOverlay';
import { useParcelTracking } from '@/hooks/useParcelTracking';
import { useSessionStore } from '@/stores/sessionStore';

export default function ActiveTrackingScreen() {
  const activity = useSessionStore((s) => s.activity);
  const activityType =
    activity === 'running' || activity === 'cycling' ? activity : 'walking';

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

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <StatusBar style="light" />
      <ParcelMap />
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

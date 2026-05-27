import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';

import { ParcelMap } from '@/components/ParcelMap';
import { ParcelRecordingOverlay } from '@/components/ParcelRecordingOverlay';
import { useParcelTracking, type ActivityType } from '@/hooks/useParcelTracking';
import { useSessionStore } from '@/stores/sessionStore';

function sessionToMapActivity(activity: string | null): ActivityType {
  if (activity === 'running' || activity === 'cycling' || activity === 'rollerblading') {
    return activity;
  }
  return 'walking';
}

export default function ActiveTrackingScreen() {
  const activity = useSessionStore((s) => s.activity);
  const activityType = sessionToMapActivity(activity);

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
      <ParcelMap activityLayer={activityType} />
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

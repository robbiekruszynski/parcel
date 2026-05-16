import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { LiveParcelMap } from '@/components/map/LiveParcelMap';
import { useSessionStore } from '@/stores/sessionStore';

function formatActivityLabel(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

export default function ActiveTrackingScreen() {
  const activity = useSessionStore((s) => s.activity);
  const activityLabel = activity ? formatActivityLabel(activity) : null;

  return (
    <View className="flex-1 bg-parcel-bg-dark">
      <StatusBar style="light" />
      <LiveParcelMap autoStartTracking activityLabel={activityLabel} />
    </View>
  );
}

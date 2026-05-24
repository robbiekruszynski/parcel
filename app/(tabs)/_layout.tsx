import { Tabs } from 'expo-router';
import { View } from 'react-native';

import { NavSheet } from '@/components/NavSheet';
import { useLocationStore } from '@/stores/locationStore';

export default function TabLayout() {
  const capturingParcel = useLocationStore((s) => s.isTracking || s.isPaused);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarStyle: { display: 'none' },
          headerShown: false,
        }}>
        <Tabs.Screen name="index" options={{ href: null }} />
        <Tabs.Screen name="map" />
        <Tabs.Screen name="territory" />
        <Tabs.Screen name="track" options={{ href: null }} />
        <Tabs.Screen name="profile" />
        <Tabs.Screen name="leaderboard" />
        <Tabs.Screen name="group" />
      </Tabs>

      {!capturingParcel && <NavSheet />}
    </View>
  );
}

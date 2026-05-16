import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { TrackingClaimTooltip } from '@/components/tracking/TrackingClaimTooltip';
import { TrackingControlBar } from '@/components/tracking/TrackingControlBar';
import { TrackingCyberMap } from '@/components/tracking/TrackingCyberMap';
import { TrackingGpsSubBar } from '@/components/tracking/TrackingGpsSubBar';
import { TrackingLoopHintBar } from '@/components/tracking/TrackingLoopHintBar';
import { TrackingStatsRow } from '@/components/tracking/TrackingStatsRow';
import { TrackingTopBar } from '@/components/tracking/TrackingTopBar';
import { TRACKING } from '@/constants/trackingTheme';

export default function ActiveTrackingScreen() {
  const { height } = useWindowDimensions();
  const mapHeight = Math.round(height * 0.6);
  /** Pill toggle state only — HUD stays dark per cyberpunk spec */
  const [cyberDark, setCyberDark] = useState(true);

  return (
    <View style={{ flex: 1, backgroundColor: TRACKING.bg }}>
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <TrackingTopBar cyberDark={cyberDark} onToggleTheme={() => setCyberDark((v) => !v)} />
        <TrackingStatsRow />
        <TrackingGpsSubBar />

        <View
          style={{
            height: mapHeight,
            position: 'relative',
            marginHorizontal: 10,
            borderRadius: 12,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: TRACKING.borderSubtle,
          }}>
          <TrackingCyberMap />
          <TrackingClaimTooltip />
          <TrackingLoopHintBar />
        </View>

        <View style={{ flex: 1, backgroundColor: TRACKING.bg }} />

        <TrackingControlBar />
      </SafeAreaView>
    </View>
  );
}

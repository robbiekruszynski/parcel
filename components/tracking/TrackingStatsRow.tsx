import { Text, View } from 'react-native';

import { TRACKING } from '@/constants/trackingTheme';

export function TrackingStatsRow() {
  return (
    <View className="flex-row items-stretch justify-between px-5 pb-3">
      <View className="flex-1">
        <View className="flex-row items-baseline">
          <Text
            style={{
              color: TRACKING.white,
              fontFamily: 'Rajdhani_700Bold',
              fontSize: 44,
              letterSpacing: -1,
              lineHeight: 48,
            }}>
            2.84
          </Text>
          <Text
            style={{
              color: TRACKING.muted,
              fontFamily: 'Rajdhani_600SemiBold',
              fontSize: 12,
              marginLeft: 3,
              transform: [{ translateY: -8 }],
            }}>
            KM
          </Text>
        </View>
        <Text
          style={{
            color: TRACKING.muted,
            fontFamily: 'DMMono_400Regular',
            fontSize: 10,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            marginTop: 2,
          }}>
          DISTANCE · 14:32
        </Text>
      </View>

      <View style={{ width: 1, backgroundColor: TRACKING.borderSubtle, marginHorizontal: 14 }} />

      <View className="flex-1 items-end">
        <Text
          style={{
            color: TRACKING.amber,
            fontFamily: 'Rajdhani_700Bold',
            fontSize: 44,
            letterSpacing: -0.5,
            lineHeight: 48,
          }}>
          2,516
        </Text>
        <Text
          style={{
            color: TRACKING.muted,
            fontFamily: 'DMMono_400Regular',
            fontSize: 10,
            letterSpacing: 1.4,
            textTransform: 'uppercase',
            marginTop: 2,
          }}>
          POINTS · +213/MIN
        </Text>
      </View>
    </View>
  );
}

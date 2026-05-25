import { Text, View } from 'react-native';

import { TRACKING } from '@/constants/trackingTheme';

export function TrackingClaimTooltip() {
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: '38%', alignItems: 'center', paddingHorizontal: 24 }} pointerEvents="none">
      <View
        style={{
          backgroundColor: TRACKING.amber,
          paddingHorizontal: 18,
          paddingVertical: 12,
          borderRadius: 999,
          alignItems: 'center',
          shadowColor: TRACKING.amber,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.45,
          shadowRadius: 14,
          elevation: 8,
        }}>
        <Text
          style={{
            color: TRACKING.bg,
            fontFamily: 'Rajdhani_700Bold',
            fontSize: 13,
            letterSpacing: 1.6,
          }}>
          CLOSE TO CLAIM
        </Text>
        <Text style={{ color: '#141414', fontFamily: 'DMMono_400Regular', fontSize: 11, marginTop: 4 }}>
          0.06 KM² · +1,240 PTS
        </Text>
        {/* Arrow */}
        <View
          style={{
            marginTop: 8,
            width: 0,
            height: 0,
            borderLeftWidth: 7,
            borderRightWidth: 7,
            borderTopWidth: 9,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: TRACKING.amber,
          }}
        />
      </View>
    </View>
  );
}

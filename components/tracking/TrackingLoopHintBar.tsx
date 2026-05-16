import { Text, View } from 'react-native';

import { TRACKING } from '@/constants/trackingTheme';

export function TrackingLoopHintBar() {
  return (
    <View className="absolute bottom-5 left-5 right-5 items-center">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: 'rgba(17,17,17,0.92)',
          borderRadius: 999,
          paddingVertical: 11,
          paddingHorizontal: 18,
          borderWidth: 1,
          borderColor: TRACKING.borderSubtle,
        }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: TRACKING.amber,
            shadowColor: TRACKING.amber,
            shadowOpacity: 0.9,
            shadowRadius: 6,
          }}
        />
        <Text style={{ color: TRACKING.white, fontFamily: 'DMMono_400Regular', fontSize: 12, letterSpacing: 0.8 }}>
          87M TO CLOSE THE LOOP
        </Text>
      </View>
    </View>
  );
}

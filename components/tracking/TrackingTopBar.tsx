import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { TRACKING } from '@/constants/trackingTheme';

type Props = {
  cyberDark: boolean;
  onToggleTheme: () => void;
};

export function TrackingTopBar({ cyberDark, onToggleTheme }: Props) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(withTiming(0.35, { duration: 550 }), withTiming(1, { duration: 550 })),
      -1,
      false
    );
  }, [pulse]);

  const liveStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <FontAwesome name="cube" size={14} color={TRACKING.white} />
        <Text
          style={{
            color: TRACKING.white,
            fontSize: 17,
            letterSpacing: 0.5,
            fontFamily: 'Rajdhani_600SemiBold',
          }}>
          parcel
        </Text>
      </View>

      <Pressable
        onPress={onToggleTheme}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: 999,
          paddingVertical: 6,
          paddingHorizontal: 6,
          backgroundColor: TRACKING.bgElev,
          borderWidth: 1,
          borderColor: TRACKING.borderSubtle,
        }}>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: !cyberDark ? TRACKING.amber : 'transparent',
          }}>
          <FontAwesome name="sun-o" size={13} color={!cyberDark ? TRACKING.bg : TRACKING.muted} />
        </View>
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 5,
            borderRadius: 999,
            backgroundColor: cyberDark ? TRACKING.slate : 'transparent',
          }}>
          <FontAwesome name="moon-o" size={13} color={cyberDark ? TRACKING.white : TRACKING.muted} />
        </View>
      </Pressable>

      <Animated.View style={[liveStyle, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: TRACKING.liveRed }} />
        <Text style={{ color: TRACKING.liveRed, fontSize: 11, letterSpacing: 1.2, fontFamily: 'DMMono_400Regular' }}>
          LIVE
        </Text>
      </Animated.View>
    </View>
  );
}

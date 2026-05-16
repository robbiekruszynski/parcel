import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { TRACKING } from '@/constants/trackingTheme';

type Props = {
  onPause?: () => void;
};

export function TrackingControlBar({ onPause }: Props) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 28,
        paddingVertical: 16,
        backgroundColor: TRACKING.bg,
        borderTopWidth: 1,
        borderTopColor: TRACKING.borderSubtle,
      }}>
      <Pressable
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: TRACKING.bgElev,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: TRACKING.borderSubtle,
        }}>
        <FontAwesome name="clone" size={18} color={TRACKING.muted} />
      </Pressable>

      <Pressable
        onPress={onPause}
        style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: TRACKING.amber,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 3,
          borderColor: TRACKING.amberDark,
          shadowColor: TRACKING.amber,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.55,
          shadowRadius: 16,
          elevation: 12,
        }}>
        <FontAwesome name="pause" size={26} color={TRACKING.bg} />
      </Pressable>

      <Pressable
        onPress={() => router.push('/tracking/session-end')}
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: TRACKING.liveRed,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: TRACKING.liveRed,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.45,
          shadowRadius: 10,
          elevation: 8,
        }}>
        <FontAwesome name="stop" size={16} color={TRACKING.white} />
      </Pressable>
    </View>
  );
}

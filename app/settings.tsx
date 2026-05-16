import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-parcel-bg-dark px-5" style={{ paddingTop: Math.max(insets.top, 14) }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => router.back()}
        hitSlop={12}
        className="mb-8 flex-row items-center gap-3 self-start py-2">
        <FontAwesome name="chevron-left" size={18} color="#f5c518" />
        <Text className="text-base font-semibold text-parcel-gold">Back</Text>
      </Pressable>
      <Text className="text-3xl font-bold text-white" style={{ fontFamily: 'Rajdhani_700Bold' }}>
        Settings
      </Text>
      <Text className="mt-4 max-w-md leading-6 text-white/45">
        Theme (light / dark) and app preferences will be configured here.
      </Text>
    </View>
  );
}

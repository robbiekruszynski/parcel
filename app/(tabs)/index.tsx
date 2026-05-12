import { Text, View } from 'react-native';

export default function ExploreScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-parcel-bg-light dark:bg-parcel-bg-dark">
      <Text
        className="text-parcel-bg-dark dark:text-white"
        style={{ fontFamily: 'Syne_800ExtraBold', fontSize: 22 }}>
        explore
      </Text>
      <Text className="mt-2 px-8 text-center text-parcel-bg-dark/70 dark:text-white/60" style={{ fontFamily: 'DMMono_400Regular' }}>
        Global parcel map + realtime subscriptions
      </Text>
    </View>
  );
}

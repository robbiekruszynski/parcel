import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

export default function SessionEndScreen() {
  return (
    <View className="flex-1 justify-end bg-parcel-bg-dark pb-12">
      <View className="rounded-t-3xl bg-parcel-bg-light p-6 dark:bg-neutral-900">
        <Text
          className="mb-2 text-2xl text-parcel-bg-dark dark:text-white"
          style={{ fontFamily: 'Syne_800ExtraBold' }}>
          session complete
        </Text>
        <Text className="mb-6 text-parcel-bg-dark/70 dark:text-white/60" style={{ fontFamily: 'DMMono_400Regular' }}>
          Replay + stats sheet — hook to session store next.
        </Text>
        <Pressable
          className="rounded-xl bg-parcel-gold py-4"
          onPress={() => router.replace('/(tabs)/profile')}>
          <Text className="text-center font-semibold text-parcel-bg-dark">Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

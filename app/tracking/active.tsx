import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

export default function ActiveTrackingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-parcel-bg-dark">
      <Text className="mb-4 px-6 text-center text-white/80" style={{ fontFamily: 'DMMono_400Regular' }}>
        Full-screen map + trail + dock controls go here.
      </Text>
      <Pressable
        className="rounded-full bg-white/10 px-6 py-3"
        onPress={() => router.push('/tracking/session-end')}>
        <Text className="text-white">End session (stub)</Text>
      </Pressable>
    </View>
  );
}

import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

export default function HeroScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-parcel-bg-dark px-8">
      <Text
        className="mb-2 text-center text-6xl text-white"
        style={{
          fontFamily: 'Syne_800ExtraBold',
          letterSpacing: -1,
        }}>
        parcel
      </Text>
      <Text
        className="mb-14 text-center text-base text-white/60"
        style={{ fontFamily: 'DMMono_400Regular' }}>
        claim your city
      </Text>

      <Pressable
        className="mb-3 w-full max-w-sm rounded-xl bg-white py-4"
        onPress={() => router.push('/(auth)/sign-in')}>
        <Text className="text-center text-base font-semibold text-parcel-bg-dark">Sign in</Text>
      </Pressable>

      <Pressable
        className="w-full max-w-sm rounded-xl border border-white/25 bg-transparent py-4"
        onPress={() => router.push('/(auth)/register')}>
        <Text className="text-center text-base font-semibold text-white">Create account</Text>
      </Pressable>
    </View>
  );
}

import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

/** OAuth wiring lands here (Apple + Google via Supabase). Placeholder advances for UI iteration. */
export default function SignInScreen() {
  return (
    <View className="flex-1 justify-center bg-parcel-bg-dark px-8">
      <Text
        className="mb-8 text-center text-3xl text-white"
        style={{ fontFamily: 'Syne_800ExtraBold', letterSpacing: -1 }}>
        sign in
      </Text>
      <Pressable
        className="mb-3 rounded-xl bg-white py-4"
        onPress={() => router.replace('/(tabs)')}>
        <Text className="text-center font-semibold text-parcel-bg-dark">Demo: existing user</Text>
      </Pressable>
      <Pressable
        className="rounded-xl border border-white/25 py-4"
        onPress={() => router.replace('/(auth)/register')}>
        <Text className="text-center font-semibold text-white">Demo: new user → register</Text>
      </Pressable>
    </View>
  );
}

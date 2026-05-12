import { router } from 'expo-router';
import { Pressable, Text, TextInput, View } from 'react-native';

export default function RegisterScreen() {
  return (
    <View className="flex-1 justify-center bg-parcel-bg-dark px-8">
      <Text
        className="mb-6 text-center text-3xl text-white"
        style={{ fontFamily: 'Syne_800ExtraBold', letterSpacing: -1 }}>
        set up profile
      </Text>
      <TextInput
        placeholder="username"
        placeholderTextColor="rgba(255,255,255,0.35)"
        className="mb-3 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextInput
        placeholder="display name"
        placeholderTextColor="rgba(255,255,255,0.35)"
        className="mb-6 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white"
      />
      <Pressable
        className="rounded-xl bg-parcel-gold py-4"
        onPress={() => router.replace('/(tabs)')}>
        <Text className="text-center font-semibold text-parcel-bg-dark">Continue</Text>
      </Pressable>
    </View>
  );
}

import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/components/AuthProvider';
import { isSupabaseConfigured } from '@/lib/supabase';

export default function SignInScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onSignIn = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Supabase not configured',
        'Copy .env.example to .env, add your project URL and anon key, then restart Expo with npx expo start --clear.'
      );
      return;
    }
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Enter your email and password.');
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not sign in';
      Alert.alert('Sign in failed', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-parcel-bg-dark">
      <View className="flex-1 justify-center px-8">
        <Text
          className="mb-2 text-center text-3xl text-white"
          style={{ fontFamily: 'Syne_800ExtraBold', letterSpacing: -1 }}>
          sign in
        </Text>
        <Text
          className="mb-8 text-center text-sm text-white/45"
          style={{ fontFamily: 'DMMono_400Regular' }}>
          use your parcel account
        </Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="email"
          placeholderTextColor="rgba(255,255,255,0.35)"
          className="mb-3 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          editable={!busy}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="password"
          placeholderTextColor="rgba(255,255,255,0.35)"
          className="mb-6 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white"
          secureTextEntry
          autoComplete="off"
          textContentType="none"
          passwordRules=""
          editable={!busy}
        />

        <Pressable
          className="mb-3 rounded-xl bg-white py-4"
          onPress={() => void onSignIn()}
          disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#0b0d12" />
          ) : (
            <Text className="text-center font-semibold text-parcel-bg-dark">Sign in</Text>
          )}
        </Pressable>

        <Pressable
          className="rounded-xl border border-white/25 py-4"
          onPress={() => router.push('/(auth)/register')}
          disabled={busy}>
          <Text className="text-center font-semibold text-white">Create account</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

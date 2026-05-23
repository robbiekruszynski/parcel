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
import { EmailConfirmationRequiredError } from '@/lib/authErrors';
import { isSupabaseConfigured } from '@/lib/supabase';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);

  const onRegister = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Supabase not configured',
        'Copy .env.example to .env, add your project URL and anon key, then restart Expo with npx expo start --clear.'
      );
      return;
    }

    if (!email.trim() || !password || !username.trim()) {
      Alert.alert('Missing fields', 'Email, password, and username are required.');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }

    setBusy(true);
    try {
      await signUp(email, password, username, displayName);
    } catch (e: unknown) {
      if (e instanceof EmailConfirmationRequiredError) {
        Alert.alert('Account created', e.message, [
          { text: 'Sign in', onPress: () => router.replace('/(auth)/sign-in') },
        ]);
        return;
      }
      const msg = e instanceof Error ? e.message : 'Could not create account';
      Alert.alert('Registration failed', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-parcel-bg-dark">
      <View className="flex-1 justify-center px-8">
        <Text
          className="mb-6 text-center text-3xl text-white"
          style={{ fontFamily: 'Syne_800ExtraBold', letterSpacing: -1 }}>
          create account
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
          placeholder="password (6+ characters)"
          placeholderTextColor="rgba(255,255,255,0.35)"
          className="mb-3 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white"
          secureTextEntry
          autoComplete="off"
          textContentType="none"
          passwordRules=""
          editable={!busy}
        />
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="username"
          placeholderTextColor="rgba(255,255,255,0.35)"
          className="mb-3 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="display name (optional)"
          placeholderTextColor="rgba(255,255,255,0.35)"
          className="mb-6 rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white"
          editable={!busy}
        />

        <Pressable
          className="mb-3 rounded-xl bg-parcel-gold py-4"
          onPress={() => void onRegister()}
          disabled={busy}>
          {busy ? (
            <ActivityIndicator color="#0b0d12" />
          ) : (
            <Text className="text-center font-semibold text-parcel-bg-dark">Create account</Text>
          )}
        </Pressable>

        <Pressable className="rounded-xl border border-white/25 py-4" onPress={() => router.back()} disabled={busy}>
          <Text className="text-center font-semibold text-white">Already have an account</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

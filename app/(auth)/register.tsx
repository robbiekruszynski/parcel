import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
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
      style={styles.root}>
      <View style={styles.inner}>
        <Text style={styles.heading}>create account</Text>

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="email"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={styles.input}
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
          style={styles.input}
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
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
        />
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="display name (optional)"
          placeholderTextColor="rgba(255,255,255,0.35)"
          style={[styles.input, styles.inputLast]}
          editable={!busy}
        />

        <Pressable
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
          onPress={() => void onRegister()}
          disabled={busy}>
          {busy
            ? <ActivityIndicator color="#0b0d12" />
            : <Text style={styles.btnPrimaryText}>Create account</Text>}
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.75 }]}
          onPress={() => router.replace('/(auth)/sign-in')}
          disabled={busy}>
          <Text style={styles.btnSecondaryText}>Sign in instead</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0e0e10',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  heading: {
    fontFamily: 'Syne_800ExtraBold',
    fontSize: 30,
    color: '#ffffff',
    letterSpacing: -1,
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#ffffff',
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 15,
    marginBottom: 12,
  },
  inputLast: {
    marginBottom: 24,
  },
  btnPrimary: {
    backgroundColor: '#f5c518',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  btnPrimaryText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 16,
    fontWeight: '700',
    color: '#0e0e10',
    letterSpacing: 0.4,
  },
  btnSecondary: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  btnSecondaryText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 0.4,
  },
});

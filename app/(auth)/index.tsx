/**
 * (auth)/index.tsx — Combined sign-in + sign-up screen
 *
 * Single screen handles both flows with a tab toggle:
 *  · "Sign In"          — email + password → signIn()
 *  · "Create Account"   — email + password + username (+optional display name) → signUp()
 *
 * The "parcel" wordmark uses adjustsFontSizeToFit + numberOfLines={1}
 * so it always renders on a single line regardless of device width.
 */

import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/components/AuthProvider';
import { EmailConfirmationRequiredError } from '@/lib/authErrors';
import { isSupabaseConfigured } from '@/lib/supabase';

type Mode = 'signin' | 'signup';

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();

  const [mode, setMode]               = useState<Mode>('signin');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [username, setUsername]       = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy]               = useState(false);

  const passwordRef    = useRef<TextInput>(null);
  const usernameRef    = useRef<TextInput>(null);
  const displayNameRef = useRef<TextInput>(null);

  const switchMode = (next: Mode) => {
    setMode(next);
    setEmail('');
    setPassword('');
    setUsername('');
    setDisplayName('');
  };

  const handleContinue = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Supabase not configured',
        'Copy .env.example to .env, add your project URL and anon key, then restart.'
      );
      return;
    }
    if (!email.trim() || !password) {
      Alert.alert('Missing fields', 'Enter your email and password.');
      return;
    }
    if (mode === 'signup') {
      if (!username.trim()) {
        Alert.alert('Missing fields', 'Choose a username.');
        return;
      }
      if (password.length < 6) {
        Alert.alert('Password too short', 'Use at least 6 characters.');
        return;
      }
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, username.trim(), displayName.trim());
      }
    } catch (e: unknown) {
      if (e instanceof EmailConfirmationRequiredError) {
        Alert.alert('Check your email', e.message, [
          { text: 'OK', onPress: () => switchMode('signin') },
        ]);
        return;
      }
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      Alert.alert(mode === 'signin' ? 'Sign in failed' : 'Registration failed', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>

          {/* ── Wordmark ───────────────────────────────────────────────── */}
          <View style={s.hero}>
            <Text
              style={s.wordmark}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}>
              parcel
            </Text>
            <Text style={s.tagline}>claim your city</Text>
          </View>

          {/* ── Mode toggle ─────────────────────────────────────────────── */}
          <View style={s.toggle}>
            <Pressable
              style={[s.toggleBtn, mode === 'signin' && s.toggleBtnActive]}
              onPress={() => switchMode('signin')}
              disabled={busy}>
              <Text style={[s.toggleTxt, mode === 'signin' && s.toggleTxtActive]}>
                Sign In
              </Text>
            </Pressable>
            <Pressable
              style={[s.toggleBtn, mode === 'signup' && s.toggleBtnActive]}
              onPress={() => switchMode('signup')}
              disabled={busy}>
              <Text style={[s.toggleTxt, mode === 'signup' && s.toggleTxtActive]}>
                Create Account
              </Text>
            </Pressable>
          </View>

          {/* ── Form ────────────────────────────────────────────────────── */}
          <View style={s.form}>

            <Text style={s.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              placeholderTextColor="rgba(255,255,255,0.25)"
              style={s.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              editable={!busy}
            />

            <Text style={s.label}>Password</Text>
            <TextInput
              ref={passwordRef}
              value={password}
              onChangeText={setPassword}
              placeholder={mode === 'signup' ? 'min. 6 characters' : '••••••••'}
              placeholderTextColor="rgba(255,255,255,0.25)"
              style={s.input}
              secureTextEntry
              autoComplete="off"
              textContentType="none"
              passwordRules=""
              returnKeyType={mode === 'signup' ? 'next' : 'done'}
              onSubmitEditing={() =>
                mode === 'signup'
                  ? usernameRef.current?.focus()
                  : void handleContinue()
              }
              editable={!busy}
            />

            {mode === 'signin' ? (
              <>
                <Pressable
                  style={({ pressed }) => [
                    s.primaryBtn,
                    (pressed || busy) && s.btnPressed,
                    busy && s.btnDisabled,
                  ]}
                  onPress={() => void handleContinue()}
                  disabled={busy}>
                  {busy ? (
                    <ActivityIndicator color="#0e0e10" size="small" />
                  ) : (
                    <Text style={s.primaryBtnTxt}>Sign In</Text>
                  )}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    s.secondaryBtn,
                    pressed && !busy && s.btnPressed,
                  ]}
                  onPress={() => switchMode('signup')}
                  disabled={busy}>
                  <Text style={s.secondaryBtnTxt}>Create Account</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={s.label}>Username</Text>
                <TextInput
                  ref={usernameRef}
                  value={username}
                  onChangeText={setUsername}
                  placeholder="@handle"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  style={s.input}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="next"
                  onSubmitEditing={() => displayNameRef.current?.focus()}
                  editable={!busy}
                />

                <Text style={s.label}>
                  Display Name{' '}
                  <Text style={s.labelOptional}>(optional)</Text>
                </Text>
                <TextInput
                  ref={displayNameRef}
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="How others see you"
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  style={s.input}
                  returnKeyType="done"
                  onSubmitEditing={() => void handleContinue()}
                  editable={!busy}
                />

                <Pressable
                  style={({ pressed }) => [
                    s.primaryBtn,
                    (pressed || busy) && s.btnPressed,
                    busy && s.btnDisabled,
                  ]}
                  onPress={() => void handleContinue()}
                  disabled={busy}>
                  {busy ? (
                    <ActivityIndicator color="#0e0e10" size="small" />
                  ) : (
                    <Text style={s.primaryBtnTxt}>Create Account</Text>
                  )}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [
                    s.secondaryBtn,
                    pressed && !busy && s.btnPressed,
                  ]}
                  onPress={() => switchMode('signin')}
                  disabled={busy}>
                  <Text style={s.secondaryBtnTxt}>Sign In</Text>
                </Pressable>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const AMBER = '#f5c518';
const BG    = '#0e0e10';

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 48,
  },

  // Hero / wordmark
  hero: {
    alignItems: 'center',
    paddingTop: 36,
    paddingBottom: 28,
  },
  wordmark: {
    fontFamily: 'Syne_800ExtraBold',
    fontSize: 72,
    color: '#ffffff',
    letterSpacing: -1,
    textAlign: 'center',
    width: '100%',
  },
  tagline: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
    textAlign: 'center',
    marginTop: 6,
    letterSpacing: 0.5,
  },

  // Toggle
  toggle: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: 4,
    marginBottom: 28,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 11,
    alignItems: 'center',
    borderRadius: 11,
  },
  toggleBtnActive: { backgroundColor: AMBER },
  toggleTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 15,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 0.3,
  },
  toggleTxtActive: { color: '#0e0e10', fontWeight: '700' },

  // Form
  form: { gap: 0 },
  label: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.4,
    color: 'rgba(255,255,255,0.38)',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  labelOptional: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 11,
    color: 'rgba(255,255,255,0.2)',
    textTransform: 'none',
    letterSpacing: 0,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#ffffff',
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 16,
    marginBottom: 18,
  },

  primaryBtn: {
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: AMBER,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  primaryBtnTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 18,
    fontWeight: '700',
    color: '#0e0e10',
    letterSpacing: 0.6,
  },
  secondaryBtn: {
    marginBottom: 20,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: AMBER,
    backgroundColor: 'rgba(245,197,24,0.08)',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  secondaryBtnTxt: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 16,
    fontWeight: '700',
    color: AMBER,
    letterSpacing: 0.4,
  },
  btnPressed: { opacity: 0.82 },
  btnDisabled: { opacity: 0.55 },
});

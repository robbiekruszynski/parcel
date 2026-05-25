import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function HeroScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 32) }]}>
      {/* ── Wordmark ── */}
      <View style={styles.heroBlock}>
        <Text style={styles.wordmark}>parcel</Text>
        <Text style={styles.tagline}>claim your city</Text>
      </View>

      {/* ── CTA buttons ── */}
      <View style={styles.btnBlock}>
        <Pressable
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/(auth)/sign-in')}>
          <Text style={styles.btnPrimaryText}>Sign in</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.75 }]}
          onPress={() => router.push('/(auth)/register')}>
          <Text style={styles.btnSecondaryText}>Create account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0e0e10',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  heroBlock: {
    alignItems: 'center',
    marginBottom: 56,
  },
  wordmark: {
    fontFamily: 'Syne_800ExtraBold',
    fontSize: 60,
    color: '#ffffff',
    letterSpacing: -1,
    textAlign: 'center',
    lineHeight: 68,
  },
  tagline: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
  },
  btnBlock: {
    width: '100%',
    maxWidth: 384,
    gap: 12,
  },
  btnPrimary: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
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

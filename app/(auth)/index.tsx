import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HeroScreen() {
  return (
    <SafeAreaView style={styles.root}>
      {/* ── Logo block — fills upper space ── */}
      <View style={styles.heroArea}>
        <Text style={styles.wordmark}>parcel</Text>
        <Text style={styles.tagline}>claim your city</Text>
      </View>

      {/* ── CTA buttons — pinned to the bottom ── */}
      <View style={styles.btnArea}>
        <Pressable
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/(auth)/sign-in')}>
          <Text style={styles.btnPrimaryText}>Sign in</Text>
        </Pressable>

        <View style={styles.gap} />

        <Pressable
          style={({ pressed }) => [styles.btnSecondary, pressed && { opacity: 0.75 }]}
          onPress={() => router.push('/(auth)/register')}>
          <Text style={styles.btnSecondaryText}>Create account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0e0e10',
    paddingHorizontal: 28,
  },

  // Hero occupies all space above the buttons
  heroArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: {
    fontFamily: 'Syne_800ExtraBold',
    fontSize: 64,
    color: '#ffffff',
    letterSpacing: -2,
    lineHeight: 72,
    textAlign: 'center',
  },
  tagline: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 15,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 8,
  },

  // Button block stays at the bottom of safe area
  btnArea: {
    paddingBottom: 20,
  },
  gap: { height: 12 },

  btnPrimary: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
  },
  btnPrimaryText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 17,
    fontWeight: '700',
    color: '#0e0e10',
    letterSpacing: 0.5,
  },

  btnSecondary: {
    borderRadius: 14,
    paddingVertical: 17,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  btnSecondaryText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 17,
    fontWeight: '600',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
});

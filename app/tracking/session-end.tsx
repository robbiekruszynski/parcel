import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function SessionEndScreen() {
  return (
    <View style={styles.root}>
      <View style={styles.sheet}>
        <Text style={styles.title}>session complete</Text>
        <Text style={styles.subtitle}>
          Replay + stats sheet — hook to session store next.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
          onPress={() => router.replace('/(tabs)/profile')}>
          <Text style={styles.btnText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#0e0e10',
    paddingBottom: 48,
  },
  sheet: {
    backgroundColor: '#13131a',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
  },
  title: {
    fontFamily: 'Syne_800ExtraBold',
    fontSize: 26,
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'DMMono_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 24,
    lineHeight: 20,
  },
  btn: {
    backgroundColor: '#f5c518',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 16,
    fontWeight: '700',
    color: '#0e0e10',
  },
});

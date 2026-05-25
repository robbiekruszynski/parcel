import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSessionStore, type Activity } from '@/stores/sessionStore';

const ACTIVITIES: { key: Activity; label: string }[] = [
  { key: 'walking',      label: 'Walking'      },
  { key: 'running',      label: 'Running'       },
  { key: 'cycling',      label: 'Cycling'       },
  { key: 'skating',      label: 'Skating'       },
  { key: 'rollerblading', label: 'Rollerblading' },
];

export default function TrackScreen() {
  const setActivity   = useSessionStore((s) => s.setActivity);
  const startSession  = useSessionStore((s) => s.startSession);

  const pick = (a: Activity) => {
    setActivity(a);
    startSession();
    router.push('/tracking/active');
  };

  return (
    <View style={styles.root}>
      <Text style={styles.heading}>activity</Text>
      <View style={styles.grid}>
        {ACTIVITIES.map(({ key, label }) => (
          <Pressable
            key={key}
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
            onPress={() => pick(key)}>
            <Text style={styles.cardText}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0e0e10',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  heading: {
    fontFamily: 'Syne_800ExtraBold',
    fontSize: 24,
    color: '#ffffff',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
  },
  card: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
  },
  cardText: {
    fontFamily: 'Rajdhani_600SemiBold',
    fontSize: 15,
    color: '#ffffff',
  },
});

import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { useSessionStore, type Activity } from '@/stores/sessionStore';

const ACTIVITIES: { key: Activity; label: string }[] = [
  { key: 'walking', label: 'Walking' },
  { key: 'running', label: 'Running' },
  { key: 'cycling', label: 'Cycling' },
  { key: 'skating', label: 'Skating' },
  { key: 'rollerblading', label: 'Rollerblading' },
];

export default function TrackScreen() {
  const setActivity = useSessionStore((s) => s.setActivity);
  const startSession = useSessionStore((s) => s.startSession);

  const pick = (a: Activity) => {
    setActivity(a);
    startSession();
    router.push('/tracking/active');
  };

  return (
    <View className="flex-1 bg-parcel-bg-light px-4 pt-4 dark:bg-parcel-bg-dark">
      <Text className="mb-4 text-2xl text-parcel-bg-dark dark:text-white" style={{ fontFamily: 'Syne_800ExtraBold' }}>
        activity
      </Text>
      <View className="flex-row flex-wrap justify-between gap-y-3">
        {ACTIVITIES.map(({ key, label }) => (
          <Pressable
            key={key}
            className="mb-1 w-[48%] rounded-2xl border border-parcel-bg-dark/10 bg-white py-6 dark:border-white/10 dark:bg-white/5"
            onPress={() => pick(key)}>
            <Text className="text-center text-parcel-bg-dark dark:text-white">{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

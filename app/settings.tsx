import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import { Alert, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StravaConnectButton } from '@/components/StravaConnectButton';
import { useAuth } from '@/components/AuthProvider';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  const onSignOut = () => {
    Alert.alert('Sign out', 'Leave this account on this device?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void signOut().catch((e: unknown) => {
            const msg = e instanceof Error ? e.message : 'Could not sign out';
            Alert.alert('Sign out failed', msg);
          });
        },
      },
    ]);
  };

  return (
    <View className="flex-1 bg-parcel-bg-dark px-5" style={{ paddingTop: Math.max(insets.top, 14) }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => router.back()}
        hitSlop={12}
        className="mb-8 flex-row items-center gap-3 self-start py-2">
        <FontAwesome name="chevron-left" size={18} color="#f5c518" />
        <Text className="text-base font-semibold text-parcel-gold">Back</Text>
      </Pressable>
      <Text className="text-3xl font-bold text-white" style={{ fontFamily: 'Rajdhani_700Bold' }}>
        Settings
      </Text>
      {user?.email ? (
        <Text className="mt-2 text-sm text-white/45" style={{ fontFamily: 'DMMono_400Regular' }}>
          {user.email}
        </Text>
      ) : null}
      <Text className="mt-4 max-w-md leading-6 text-white/45">
        Theme (light / dark) and app preferences will be configured here.
      </Text>
      <View className="mt-8">
        <Text
          className="mb-3 text-sm uppercase text-white/35"
          style={{ fontFamily: 'DMMono_400Regular', letterSpacing: 1.2 }}>
          Integrations
        </Text>
        <StravaConnectButton />
      </View>
      <Pressable
        className="mt-10 self-start rounded-xl border border-white/20 px-5 py-3"
        onPress={onSignOut}>
        <Text className="font-semibold text-white">Sign out</Text>
      </Pressable>
    </View>
  );
}

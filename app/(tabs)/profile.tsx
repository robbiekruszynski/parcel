import { Text, View } from 'react-native';

export default function ProfileScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-parcel-bg-light dark:bg-parcel-bg-dark">
      <Text className="text-parcel-bg-dark dark:text-white" style={{ fontFamily: 'Syne_800ExtraBold', fontSize: 22 }}>
        profile
      </Text>
      <Text className="mt-2 text-parcel-gold" style={{ fontFamily: 'DMMono_400Regular', fontSize: 28 }}>
        0 pts
      </Text>
    </View>
  );
}

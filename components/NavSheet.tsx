import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter, useSegments } from 'expo-router';
import { useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const NAV_ITEMS = [
  { name: 'map',         icon: 'map'    as const, label: 'Map'         },
  { name: 'territory',   icon: 'flag'   as const, label: 'Territory'   },
  { name: 'profile',     icon: 'user'   as const, label: 'Profile'     },
  { name: 'leaderboard', icon: 'trophy' as const, label: 'Leaderboard' },
  { name: 'group',       icon: 'users'  as const, label: 'Group'       },
];

const CONTENT_H = 90;

export function NavSheet() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  const translateY = useRef(new Animated.Value(CONTENT_H)).current;

  const activeTab = (segments[1] as string | undefined) ?? 'map';

  const toggle = (forceOpen?: boolean) => {
    const next = forceOpen ?? !isOpenRef.current;
    isOpenRef.current = next;
    setIsOpen(next);
    Animated.spring(translateY, {
      toValue: next ? 0 : CONTENT_H,
      damping: 22,
      stiffness: 220,
      useNativeDriver: true,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 6,
      onPanResponderMove: (_, { dy }) => {
        if (isOpenRef.current) {
          translateY.setValue(Math.max(0, Math.min(CONTENT_H, dy)));
        } else {
          translateY.setValue(Math.max(0, Math.min(CONTENT_H, CONTENT_H + dy)));
        }
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (isOpenRef.current) {
          toggle(dy > 28 || vy > 0.4 ? false : true);
        } else {
          toggle(dy < -28 || vy < -0.4 ? true : false);
        }
      },
    })
  ).current;

  const bottomPad = Math.max(insets.bottom, 10);

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>

      {/* Backdrop — closes sheet on tap */}
      {isOpen && (
        <Pressable
          onPress={() => toggle(false)}
          style={{ position: 'absolute', top: -600, left: 0, right: 0, bottom: 0 }}
        />
      )}

      {/* Drag handle — always visible */}
      <View
        {...panResponder.panHandlers}
        style={{ alignItems: 'center', paddingVertical: 10 }}>
        <Pressable
          onPress={() => toggle()}
          hitSlop={{ top: 12, bottom: 12, left: 40, right: 40 }}>
          <View
            style={{
              width: 38,
              height: 4,
              borderRadius: 2,
              backgroundColor: isOpen
                ? 'rgba(245,197,24,0.8)'
                : 'rgba(255,255,255,0.25)',
            }}
          />
        </Pressable>
      </View>

      {/* Sliding nav content */}
      <Animated.View
        style={{
          transform: [{ translateY }],
          backgroundColor: '#13131a',
          borderTopWidth: 1,
          borderColor: 'rgba(255,255,255,0.07)',
          overflow: 'hidden',
        }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-around',
            paddingTop: 14,
            paddingBottom: bottomPad + 6,
            paddingHorizontal: 6,
          }}>
          {NAV_ITEMS.map((item) => {
            const active = activeTab === item.name;
            return (
              <Pressable
                key={item.name}
                onPress={() => {
                  router.navigate(`/(tabs)/${item.name}` as never);
                  toggle(false);
                }}
                style={{ alignItems: 'center', gap: 5, flex: 1 }}>
                <FontAwesome
                  name={item.icon}
                  size={20}
                  color={active ? '#f5c518' : 'rgba(255,255,255,0.38)'}
                />
                <Text
                  style={{
                    fontFamily: 'Rajdhani_600SemiBold',
                    fontSize: 10,
                    letterSpacing: 0.6,
                    color: active ? '#f5c518' : 'rgba(255,255,255,0.38)',
                  }}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

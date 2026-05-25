/**
 * StravaUploadToast.tsx
 *
 * Floating notification that appears at the top of the map screen whenever
 * a Strava upload is in progress, succeeds, or fails.
 *
 * States:
 *  uploading — amber spinner + "Uploading to Strava..."
 *  success   — green check  + "Uploaded to Strava"  → auto-dismisses after 4 s
 *  failed    — red warning  + error message + RETRY + ✕
 *
 * Invisible (and zero-height) when status === 'idle' or Strava is not connected.
 */

import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { uploadSessionToStrava } from '@/lib/stravaUpload';
import { useStravaStore, type StravaUploadStatus } from '@/stores/stravaStore';
import type { ActivityType } from '@/hooks/useParcelTracking';

// ─── Component ────────────────────────────────────────────────────────────────

export function StravaUploadToast() {
  const insets = useSafeAreaInsets();

  const status      = useStravaStore((s) => s.uploadStatus);
  const error       = useStravaStore((s) => s.uploadError);
  const isConnected = useStravaStore((s) => s.isConnected);

  const slideY  = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const visible = status !== 'idle' && isConnected;

  // Slide in when visible, slide out when idle
  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: -120,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  // Retry: re-run the upload with the stored route/type/parcels
  const handleRetry = async () => {
    const store = useStravaStore.getState();
    if (!store.lastRoute || !store.lastActivityType) return;

    store.setUploadStatus('uploading');
    const result = await uploadSessionToStrava(
      store.lastRoute,
      store.lastActivityType as ActivityType,
      store.lastParcelsClaimed,
    );

    if (result.success) {
      store.setUploadStatus('success');
      setTimeout(() => {
        if (useStravaStore.getState().uploadStatus === 'success') {
          store.clearUploadStatus();
        }
      }, 4_000);
    } else if (result.needsReconnect) {
      store.setUploadStatus('failed', 'Strava needs reconnecting — go to Profile → Account & Settings.');
    } else {
      store.setUploadStatus('failed', result.error ?? 'Upload to Strava failed.');
    }
  };

  if (!isConnected) return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        styles.container,
        { top: insets.top + 70 }, // below activity selector
        { transform: [{ translateY: slideY }], opacity },
      ]}>
      <ToastContent
        status={status}
        error={error}
        onRetry={() => void handleRetry()}
        onDismiss={() => useStravaStore.getState().clearUploadStatus()}
      />
    </Animated.View>
  );
}

// ─── Inner content ────────────────────────────────────────────────────────────

function ToastContent({
  status,
  error,
  onRetry,
  onDismiss,
}: {
  status: StravaUploadStatus;
  error: string | null;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (status === 'idle') return null;

  const config = TOAST_CONFIG[status];

  return (
    <View style={[styles.pill, { borderColor: config.border }]}>
      {/* Left icon */}
      <View style={[styles.iconWrap, { backgroundColor: config.iconBg }]}>
        {status === 'uploading' ? (
          <ActivityIndicator size="small" color={config.color} />
        ) : (
          <MaterialCommunityIcons name={config.icon} size={15} color={config.color} />
        )}
      </View>

      {/* Text */}
      <View style={styles.textWrap}>
        <Text style={[styles.label, { color: config.color }]} numberOfLines={1}>
          {status === 'uploading' ? 'Uploading to Strava...' :
           status === 'success'  ? 'Uploaded to Strava'     :
           'Strava upload failed'}
        </Text>
        {status === 'failed' && error ? (
          <Text style={styles.sub} numberOfLines={2}>{error}</Text>
        ) : null}
      </View>

      {/* Actions */}
      {status === 'failed' && (
        <Pressable style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryTxt}>Retry</Text>
        </Pressable>
      )}
      {(status === 'failed' || status === 'success') && (
        <Pressable style={styles.dismissBtn} onPress={onDismiss} hitSlop={8}>
          <MaterialCommunityIcons name="close" size={14} color="rgba(255,255,255,0.4)" />
        </Pressable>
      )}
    </View>
  );
}

// ─── Toast config per state ───────────────────────────────────────────────────

const TOAST_CONFIG: Record<
  Exclude<StravaUploadStatus, 'idle'>,
  {
    color: string;
    border: string;
    iconBg: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  }
> = {
  uploading: {
    color:  '#f5c518',
    border: 'rgba(245,197,24,0.25)',
    iconBg: 'rgba(245,197,24,0.12)',
    icon:   'upload',
  },
  success: {
    color:  '#34d399',
    border: 'rgba(52,211,153,0.25)',
    iconBg: 'rgba(52,211,153,0.12)',
    icon:   'check-circle-outline',
  },
  failed: {
    color:  '#f87171',
    border: 'rgba(248,113,113,0.25)',
    iconBg: 'rgba(248,113,113,0.12)',
    icon:   'alert-circle-outline',
  },
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position:  'absolute',
    left:      14,
    right:     14,
    zIndex:    999,
  },
  pill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             10,
    backgroundColor: 'rgba(13,13,18,0.96)',
    borderRadius:    16,
    borderWidth:     1,
    paddingVertical:  10,
    paddingLeft:      10,
    paddingRight:     12,
    shadowColor:     '#000',
    shadowOpacity:   0.45,
    shadowRadius:    16,
    shadowOffset:    { width: 0, height: 4 },
    elevation:       12,
  },
  iconWrap: {
    width:         32,
    height:        32,
    borderRadius:  10,
    alignItems:    'center',
    justifyContent:'center',
    flexShrink:    0,
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontFamily:    'Rajdhani_600SemiBold',
    fontSize:      13,
    fontWeight:    '700',
    letterSpacing: 0.3,
  },
  sub: {
    fontFamily:    'Rajdhani_600SemiBold',
    fontSize:      11,
    color:         'rgba(255,255,255,0.45)',
    marginTop:     2,
    lineHeight:    15,
  },
  retryBtn: {
    paddingHorizontal: 12,
    paddingVertical:    5,
    borderRadius:       8,
    backgroundColor:    'rgba(248,113,113,0.15)',
    borderWidth:        1,
    borderColor:        'rgba(248,113,113,0.3)',
  },
  retryTxt: {
    fontFamily:    'Rajdhani_600SemiBold',
    fontSize:      12,
    color:         '#f87171',
    letterSpacing: 0.5,
  },
  dismissBtn: {
    padding: 4,
  },
});

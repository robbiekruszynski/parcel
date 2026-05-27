/**
 * Persistent session notification (Android foreground + local notification actions).
 */

import { Platform } from 'react-native';

import { stopSessionFromNotification } from '@/lib/sessionControl';

const TRACKING_NOTIFICATION_ID = 'parcel-active-session';
const STOP_ACTION = 'STOP_SESSION';

let notificationHandlerReady = false;
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let sessionStartedAtMs: number | null = null;
let activityLabel = 'Walk';

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function ensureNotificationsReady(): Promise<boolean> {
  if (notificationHandlerReady) return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });

    await Notifications.setNotificationCategoryAsync('parcel_tracking', [
      {
        identifier: STOP_ACTION,
        buttonTitle: 'Stop Session',
        options: { opensAppToForeground: true },
      },
    ]);

    Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.actionIdentifier === STOP_ACTION) {
        void stopSessionFromNotification();
      }
    });

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('tracking', {
        name: 'Active sessions',
        importance: Notifications.AndroidImportance.HIGH,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    const { status } = await Notifications.requestPermissionsAsync();
    notificationHandlerReady = status === 'granted';
    return notificationHandlerReady;
  } catch (e) {
    if (__DEV__) console.warn('[sessionNotification] setup failed', e);
    return false;
  }
}

async function postTrackingNotification(): Promise<void> {
  if (!sessionStartedAtMs) return;
  const elapsed = formatElapsed(Date.now() - sessionStartedAtMs);

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');

    await Notifications.scheduleNotificationAsync({
      identifier: TRACKING_NOTIFICATION_ID,
      content: {
        title: `parcel — ${activityLabel}`,
        body: `Recording · ${elapsed} · Tap Stop to end session`,
        categoryIdentifier: 'parcel_tracking',
        sticky: true,
        ...(Platform.OS === 'android' ? { channelId: 'tracking' } : {}),
      },
      trigger: null,
    });
  } catch (e) {
    if (__DEV__) console.warn('[sessionNotification] post failed', e);
  }
}

export async function startSessionNotification(activity: string): Promise<void> {
  activityLabel =
    activity === 'running' ? 'Run' :
    activity === 'cycling' ? 'Cycle' :
    activity === 'rollerblading' ? 'Skate' : 'Walk';

  sessionStartedAtMs = Date.now();
  const ready = await ensureNotificationsReady();
  if (!ready) return;

  if (elapsedTimer) clearInterval(elapsedTimer);
  await postTrackingNotification();
  elapsedTimer = setInterval(() => {
    void postTrackingNotification();
  }, 30_000);
}

export async function stopSessionNotification(): Promise<void> {
  sessionStartedAtMs = null;
  if (elapsedTimer) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    await Notifications.dismissNotificationAsync(TRACKING_NOTIFICATION_ID);
    await Notifications.cancelScheduledNotificationAsync(TRACKING_NOTIFICATION_ID);
  } catch {
    // ignore
  }
}

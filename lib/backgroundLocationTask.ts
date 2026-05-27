/**
 * Background GPS task — register lazily when a session starts (not at app boot).
 *
 * IMPORTANT: this task runs in a SEPARATE JS context on iOS (headless).
 * Zustand stores are NOT shared with the foreground context.
 * Only Supabase network calls are safe here.
 * Route reconstruction from DB happens in useRealtimeTracking when the app
 * returns to the foreground.
 */

import type * as Location from 'expo-location';

import { coordFromLocation } from '@/lib/mapLocation';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export const BACKGROUND_LOCATION_TASK = 'parcel-background-location';

let activeTrackingUserId: string | null = null;
let activeSessionId: string | null = null;
let taskRegistered = false;

export function setBackgroundTrackingContext(
  uid: string | null,
  sessionId: string | null,
) {
  activeTrackingUserId = uid;
  activeSessionId = sessionId;
}

async function persistBackgroundSample(loc: Location.LocationObject) {
  const uid = activeTrackingUserId;
  if (!uid || !isSupabaseConfigured) return;

  const coord = coordFromLocation(loc);
  if (!coord) return;

  // Only persist to DB — Zustand is not shared with the background JS context.
  const { error } = await supabase.from('locations').insert({
    user_id: uid,
    lat: coord.lat,
    lng: coord.lng,
    session_id: activeSessionId,
  });

  if (__DEV__ && error) {
    console.warn('[backgroundLocation] insert failed', error.message);
  }
}

function ensureBackgroundTaskRegistered(): boolean {
  if (taskRegistered) return true;

  try {
    // Lazy require — avoids native crash at app launch if the module isn't linked yet.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TaskManager = require('expo-task-manager') as typeof import('expo-task-manager');

    TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
      if (error) {
        if (__DEV__) console.warn('[backgroundLocation]', error.message);
        return;
      }
      if (!data) return;

      const { locations } = data as { locations: Location.LocationObject[] };
      const latest = locations[locations.length - 1];
      if (!latest) return;

      await persistBackgroundSample(latest);
    });

    taskRegistered = true;
    return true;
  } catch (e) {
    if (__DEV__) {
      console.warn(
        '[backgroundLocation] TaskManager unavailable — rebuild the dev client after installing expo-task-manager',
        e,
      );
    }
    return false;
  }
}

export async function startBackgroundLocationWatch(): Promise<boolean> {
  if (!ensureBackgroundTaskRegistered()) return false;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Location = require('expo-location') as typeof import('expo-location');

  const bg = await Location.requestBackgroundPermissionsAsync();
  if (bg.status !== Location.PermissionStatus.GRANTED) return false;

  const already = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (already) return true;

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 2,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'parcel',
      notificationBody: 'Recording your walk — GPS active',
      notificationColor: '#f5c518',
    },
  });

  return true;
}

export async function stopBackgroundLocationWatch(): Promise<void> {
  if (!taskRegistered) return;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Location = require('expo-location') as typeof import('expo-location');
    const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    if (started) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
  } catch (e) {
    if (__DEV__) console.warn('[backgroundLocation] stop failed', e);
  }
}

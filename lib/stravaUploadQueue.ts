import type { ActivityType } from '@/hooks/useParcelTracking';
import { uploadSessionToStrava } from '@/lib/stravaUpload';
import { useStravaStore } from '@/stores/stravaStore';

const RECONNECT_MSG =
  'Strava session expired — open Profile → Settings and reconnect Strava. Your activity is saved and will upload automatically.';

/** Run a queued upload if one is waiting and Strava is connected again. */
export async function retryQueuedStravaUpload(): Promise<void> {
  const store = useStravaStore.getState();
  if (!store.uploadQueued || !store.lastRoute || !store.lastActivityType) return;
  if (!store.isConnected || !store.syncReady) return;

  store.setUploadStatus('uploading');
  const result = await uploadSessionToStrava(
    store.lastRoute,
    store.lastActivityType as ActivityType,
    store.lastParcelsClaimed,
  );

  if (result.success) {
    store.setUploadQueued(false);
    store.setUploadStatus('success');
    setTimeout(() => {
      if (useStravaStore.getState().uploadStatus === 'success') {
        useStravaStore.getState().clearUploadStatus();
      }
    }, 4_000);
    return;
  }

  if (result.needsReconnect || result.error?.includes('expired')) {
    store.setUploadQueued(true);
    store.setUploadStatus('failed', RECONNECT_MSG);
    return;
  }

  store.setUploadStatus('failed', result.error ?? 'Upload to Strava failed.');
}

export function markStravaUploadForRetry(): void {
  useStravaStore.getState().setUploadQueued(true);
}

export { RECONNECT_MSG };

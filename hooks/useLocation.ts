import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';

import type { LatLng } from '@/lib/geo';

export type LocationPermission = 'unknown' | 'granted' | 'denied';

export function useLocationTracking(enabled: boolean) {
  const [permission, setPermission] = useState<LocationPermission>('unknown');
  const [coord, setCoord] = useState<LatLng | null>(null);

  useEffect(() => {
    let sub: Location.LocationSubscription | undefined;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setPermission(status === 'granted' ? 'granted' : 'denied');
      if (status !== 'granted' || !enabled) return;

      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000,
          distanceInterval: 5,
        },
        (loc) => {
          setCoord({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
        }
      );
    })();

    return () => {
      sub?.remove();
    };
  }, [enabled]);

  const requestBackgroundPermissions = useCallback(async () => {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return false;
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.status === 'granted';
  }, []);

  return { permission, coord, requestBackgroundPermissions };
}

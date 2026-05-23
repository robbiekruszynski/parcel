import * as Location from 'expo-location';

/** Fixes worse than this are ignored for position, route, and map centering. */
export const MAX_GPS_ACCURACY_M = 35;

export const MAP_INITIAL_ACCURACY = Location.Accuracy.BestForNavigation;

export const MAP_IDLE_WATCH_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 2000,
  distanceInterval: 5,
};

export const MAP_TRACKING_WATCH_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 1000,
  distanceInterval: 2,
};

export function isAcceptableGpsAccuracy(accuracyM: number | null | undefined): boolean {
  if (accuracyM == null) return true;
  return accuracyM <= MAX_GPS_ACCURACY_M;
}

export function coordFromLocation(loc: Location.LocationObject): { lat: number; lng: number } | null {
  const acc = loc.coords.accuracy;
  if (!isAcceptableGpsAccuracy(acc)) {
    if (__DEV__) {
      console.warn('[mapLocation] skipped fix, accuracy (m):', acc);
    }
    return null;
  }
  return { lat: loc.coords.latitude, lng: loc.coords.longitude };
}

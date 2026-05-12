export type LatLng = { latitude: number; longitude: number };

const R = 6371000;

export function haversineDistance(a: LatLng, b: LatLng): number {
  const φ1 = (a.latitude * Math.PI) / 180;
  const φ2 = (b.latitude * Math.PI) / 180;
  const Δφ = ((b.latitude - a.latitude) * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;

  const sinΔφ = Math.sin(Δφ / 2);
  const sinΔλ = Math.sin(Δλ / 2);

  const h =
    sinΔφ * sinΔφ + Math.cos(φ1) * Math.cos(φ2) * sinΔλ * sinΔλ;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Closed loop when latest point is within threshold of session start. */
export function isLoopClosed(
  points: LatLng[],
  startPoint: LatLng,
  thresholdMeters = 30
): boolean {
  if (points.length < 4) return false;
  const last = points[points.length - 1];
  return haversineDistance(last, startPoint) <= thresholdMeters;
}

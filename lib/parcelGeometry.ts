/**
 * parcelGeometry.ts
 * Clean geometry utilities for the Parcel territory mechanic.
 * Unified replacement for the overlapping helpers in territory.ts + geo.ts.
 */

import area from '@turf/area';
import { polygon as turfPolygon } from '@turf/helpers';
import simplify from '@turf/simplify';
import unkinkPolygon from '@turf/unkink-polygon';

import { haversineDistance } from '@/lib/geo';
import type { Coord } from '@/stores/locationStore';

// ─── Constants ────────────────────────────────────────────────────────────────

/** GPS path is considered a closed loop when the last point is within this
 *  distance of the starting point. */
export const LOOP_CLOSE_THRESHOLD_M = 30;

/** Minimum number of distinct GPS points required to form a valid parcel. */
export const MIN_PARCEL_POINTS = 5;

/** Parcels smaller than this are rejected as noise. */
export const MIN_PARCEL_AREA_M2 = 50;

/**
 * Minimum total route distance (metres) before loop-close detection activates.
 * Prevents GPS jitter from immediately triggering a "closed loop" right after
 * a claim resets the route while the user is still standing still.
 */
export const MIN_LOOP_DISTANCE_M = 100;

// ─── Distance ─────────────────────────────────────────────────────────────────

export function distanceBetween(a: Coord, b: Coord): number {
  return haversineDistance(
    { latitude: a.lat, longitude: a.lng },
    { latitude: b.lat, longitude: b.lng }
  );
}

/** Total path length in meters. */
export function routeLengthMeters(route: Coord[]): number {
  if (route.length < 2) return 0;
  let d = 0;
  for (let i = 1; i < route.length; i++) {
    d += distanceBetween(route[i - 1], route[i]);
  }
  return d;
}

// ─── Loop detection ───────────────────────────────────────────────────────────

/**
 * Returns true when the user has walked back within LOOP_CLOSE_THRESHOLD_M
 * of their starting point, has enough points, and has covered enough distance
 * that GPS jitter alone cannot trigger a false loop-close.
 */
export function isLoopClosed(route: Coord[]): boolean {
  if (route.length < MIN_PARCEL_POINTS + 1) return false;
  if (routeLengthMeters(route) < MIN_LOOP_DISTANCE_M) return false;
  return (
    distanceBetween(route[0], route[route.length - 1]) <= LOOP_CLOSE_THRESHOLD_M
  );
}

// ─── Polygon construction ─────────────────────────────────────────────────────

const SIMPLIFY_TOLERANCE = 0.00003; // ~3 m at mid-latitudes
const MAX_SEGMENT_M = 200; // drop GPS spikes longer than this between consecutive points

function closeRing(ring: [number, number][]): [number, number][] {
  if (ring.length < 3) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

function coordsToRing(route: Coord[]): [number, number][] {
  return route.map((c) => [c.lng, c.lat]);
}

function ringToCoords(ring: [number, number][]): Coord[] {
  const open =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  return open.map(([lng, lat], i) => ({
    lat,
    lng,
    ts: Date.now() + i,
  }));
}

function filterRingSpikes(ring: [number, number][]): [number, number][] {
  if (ring.length < 2) return ring;
  const out: [number, number][] = [ring[0]];
  for (let i = 1; i < ring.length; i++) {
    const prev = out[out.length - 1];
    const cur = ring[i];
    const dist = haversineDistance(
      { latitude: prev[1], longitude: prev[0] },
      { latitude: cur[1], longitude: cur[0] },
    );
    if (dist <= MAX_SEGMENT_M) out.push(cur);
  }
  return out.length >= MIN_PARCEL_POINTS ? out : ring;
}

function simplifyAndUnkinkRing(ring: [number, number][]): [number, number][] {
  let poly = turfPolygon([closeRing(ring)]);
  poly = simplify(poly, { tolerance: SIMPLIFY_TOLERANCE, highQuality: true });

  const unkinked = unkinkPolygon(poly);
  if (unkinked.features.length === 0) return ring;

  const best = unkinked.features.reduce((a, b) =>
    area(a) >= area(b) ? a : b
  );
  const coords = best.geometry.coordinates[0] as [number, number][];
  return coords.slice(0, -1);
}

/**
 * Trim a GPS route to the first valid loop close, snap the end to the start,
 * simplify, and remove self-intersections before claim/storage.
 */
export function prepareClaimRoute(route: Coord[]): Coord[] {
  if (route.length < MIN_PARCEL_POINTS) {
    throw new Error(`Need at least ${MIN_PARCEL_POINTS} GPS points to form a parcel.`);
  }

  const start = route[0];
  let closeIndex = route.length - 1;

  for (let i = MIN_PARCEL_POINTS; i < route.length; i++) {
    if (distanceBetween(route[i], start) <= LOOP_CLOSE_THRESHOLD_M) {
      if (routeLengthMeters(route.slice(0, i + 1)) >= MIN_LOOP_DISTANCE_M) {
        closeIndex = i;
        break;
      }
    }
  }

  let trimmed = route.slice(0, closeIndex + 1);
  trimmed = [...trimmed.slice(0, -1), { ...start, ts: trimmed[trimmed.length - 1].ts }];

  let ring = filterRingSpikes(coordsToRing(trimmed));
  ring = simplifyAndUnkinkRing(ring);

  const cleaned = ringToCoords(ring);
  if (cleaned.length < MIN_PARCEL_POINTS) {
    throw new Error('Route too short after cleaning — keep moving.');
  }
  return cleaned;
}

/** Sanitize stored [lat,lng] pairs for map rendering (legacy self-intersecting rings). */
export function sanitizeStoredRing(pairs: [number, number][]): [number, number][] | null {
  const valid = pairs.filter(
    ([lat, lng]) =>
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180,
  );
  if (valid.length < MIN_PARCEL_POINTS) return null;

  const asCoords: Coord[] = valid.map(([lat, lng], i) => ({ lat, lng, ts: i }));
  try {
    const ring = simplifyAndUnkinkRing(filterRingSpikes(coordsToRing(asCoords)));
    const cleaned = ringToCoords(ring).map((c) => [c.lat, c.lng] as [number, number]);
    return cleaned.length >= 3 ? cleaned : null;
  } catch {
    return valid.length >= 3 ? valid : null;
  }
}

/** GeoJSON ring [lng,lat][] for one parcel — never connects separate parcels. */
export function parcelRingForGeoJson(pairs: [number, number][]): [number, number][] | null {
  const cleaned = sanitizeStoredRing(pairs);
  if (!cleaned) return null;
  return closeRing(cleaned.map(([lat, lng]) => [lng, lat]));
}

/**
 * Build a Turf GeoJSON polygon from a GPS route.
 * Uses [longitude, latitude] order as required by GeoJSON spec.
 */
export function buildGeoJsonPolygon(route: Coord[]) {
  if (route.length < MIN_PARCEL_POINTS) {
    throw new Error(`Need at least ${MIN_PARCEL_POINTS} GPS points to form a parcel.`);
  }
  const ring = closeRing(coordsToRing(route));
  return turfPolygon([ring]);
}

/**
 * Area of the parcel polygon in square metres (via Turf).
 */
export function calculateAreaM2(route: Coord[]): number {
  return area(buildGeoJsonPolygon(prepareClaimRoute(route)));
}

// ─── Storage format helpers ───────────────────────────────────────────────────

/**
 * Convert a route to [lat, lng] pairs for jsonb storage in Supabase.
 * (Database trigger converts these to PostGIS geography automatically.)
 */
export function routeToLatLngPairs(route: Coord[]): [number, number][] {
  return route.map((c) => [c.lat, c.lng]);
}

/**
 * Convert stored [lat, lng] pairs to MapView coordinate objects.
 * Note: Mapbox layers use GeoJSON [lng, lat] order — convert inline when building GeoJSON.
 */
export function latLngPairsToMapCoords(
  pairs: [number, number][]
): { latitude: number; longitude: number }[] {
  return pairs.map(([lat, lng]) => ({ latitude: lat, longitude: lng }));
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatDistanceM(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

export function formatAreaM2(m2: number): string {
  if (m2 >= 1_000_000) return `${(m2 / 1_000_000).toFixed(3)} km²`;
  if (m2 >= 10_000) return `${(m2 / 10_000).toFixed(2)} ha`;
  return `${Math.round(m2)} m²`;
}

// ─── Color palette ────────────────────────────────────────────────────────────

const PARCEL_PALETTE = [
  '#f5c518', // amber   (self / default)
  '#22d3ee', // cyan
  '#a78bfa', // violet
  '#34d399', // emerald
  '#fb923c', // orange
  '#f472b6', // pink
  '#60a5fa', // blue
  '#4ade80', // green
];

/**
 * Deterministic colour for a given user — same result every call.
 */
export function userParcelColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return PARCEL_PALETTE[h % PARCEL_PALETTE.length];
}

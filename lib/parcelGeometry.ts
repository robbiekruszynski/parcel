/**
 * parcelGeometry.ts
 * Clean geometry utilities for the Parcel territory mechanic.
 * Unified replacement for the overlapping helpers in territory.ts + geo.ts.
 */

import area from '@turf/area';
import { polygon as turfPolygon } from '@turf/helpers';

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
 * of their starting point and there are enough points for a polygon.
 */
export function isLoopClosed(route: Coord[]): boolean {
  if (route.length < MIN_PARCEL_POINTS + 1) return false;
  return (
    distanceBetween(route[0], route[route.length - 1]) <= LOOP_CLOSE_THRESHOLD_M
  );
}

// ─── Polygon construction ─────────────────────────────────────────────────────

/**
 * Build a Turf GeoJSON polygon from a GPS route.
 * Uses [longitude, latitude] order as required by GeoJSON spec.
 */
export function buildGeoJsonPolygon(route: Coord[]) {
  if (route.length < MIN_PARCEL_POINTS) {
    throw new Error(`Need at least ${MIN_PARCEL_POINTS} GPS points to form a parcel.`);
  }
  const ring: [number, number][] = route.map((c) => [c.lng, c.lat]);
  // Close the ring if not already closed
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return turfPolygon([ring]);
}

/**
 * Area of the parcel polygon in square metres (via Turf).
 */
export function calculateAreaM2(route: Coord[]): number {
  return area(buildGeoJsonPolygon(route));
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

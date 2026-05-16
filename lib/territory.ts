import area from '@turf/area';

import { haversineDistance } from '@/lib/geo';
import { supabase } from '@/lib/supabase';
import type { Coord } from '@/stores/locationStore';

/** GeoJSON Polygon (lon/lat rings). */
export type TerritoryPolygonJson = {
  type: 'Polygon';
  coordinates: [number, number][][];
};

function toLatLng(c: Coord) {
  return { latitude: c.lat, longitude: c.lng };
}

/** Sum of segment lengths along the route (meters). */
export function routeDistanceMeters(route: Coord[]): number {
  let d = 0;
  for (let i = 1; i < route.length; i++) {
    d += haversineDistance(toLatLng(route[i - 1]), toLatLng(route[i]));
  }
  return d;
}

/** Loop closed when enough samples and last point is within 20 m of the route start. */
export function isLoopClosed(route: Coord[]): boolean {
  if (route.length <= 10) return false;
  const first = route[0];
  const last = route[route.length - 1];
  return haversineDistance(toLatLng(first), toLatLng(last)) <= 20;
}

/** GeoJSON Polygon (WGS84 lon/lat), ring closed. */
export function buildPolygon(route: Coord[]): TerritoryPolygonJson {
  if (route.length < 4) {
    throw new Error('Route too short for polygon');
  }
  const ring: [number, number][] = route.map((c) => [c.lng, c.lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  return {
    type: 'Polygon',
    coordinates: [ring],
  };
}

/** Area in square meters (planar projection used by Turf for GeoJSON). */
export function calculateArea(polygon: TerritoryPolygonJson): number {
  return area(polygon);
}

export async function claimTerritory(route: Coord[], userId: string): Promise<void> {
  const polygon = buildPolygon(route);
  const areaM2 = calculateArea(polygon);

  const { error } = await supabase.from('territories').insert({
    user_id: userId,
    polygon,
    area_m2: areaM2,
  });

  if (error) {
    throw error;
  }
}

/**
 * gpxExport.ts
 *
 * Converts a Parcel GPS route to GPX 1.1 XML.
 * GPX is the format Strava's upload API accepts for activities.
 *
 * Each route point must have a `ts` timestamp (Unix epoch ms).
 * Points without timestamps get evenly spaced times (1-second intervals).
 */

import type { Coord } from '@/stores/locationStore';

export interface GpxOptions {
  /** Activity name shown in Strava feed. */
  name: string;
  /** Optional description shown in Strava activity details. */
  description?: string;
}

/** Returns a GPX 1.1 XML string ready to POST to Strava /uploads. */
export function buildGpx(route: Coord[], options: GpxOptions): string {
  if (route.length < 2) {
    throw new Error('Route must have at least 2 points to export as GPX.');
  }

  const { name, description } = options;

  // If first point has no timestamp, backfill by assuming 1 s per point.
  const startTs = route[0].ts ?? Date.now() - route.length * 1000;

  const trackPoints = route
    .map((c, i) => {
      const ts = c.ts ?? startTs + i * 1000;
      const iso = new Date(ts).toISOString();
      return `    <trkpt lat="${c.lat.toFixed(7)}" lon="${c.lng.toFixed(7)}">
      <time>${iso}</time>
    </trkpt>`;
    })
    .join('\n');

  const descTag = description
    ? `\n  <desc>${escapeXml(description)}</desc>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Parcel"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${escapeXml(name)}</name>${descTag}
  </metadata>
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${trackPoints}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

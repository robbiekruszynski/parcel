import type { LatLng } from '@/lib/geo';

/** Ramer–Douglas–Peucker in WGS84 degrees; ε matches server-side simplification target. */
export function simplifyPath(points: LatLng[], epsilonDegrees = 0.00005): LatLng[] {
  if (points.length <= 2) return [...points];

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistanceDegrees(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > epsilonDegrees) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), epsilonDegrees);
    const right = simplifyPath(points.slice(maxIdx), epsilonDegrees);
    return [...left.slice(0, -1), ...right];
  }

  return [first, last];
}

function perpendicularDistanceDegrees(p: LatLng, lineStart: LatLng, lineEnd: LatLng): number {
  const x = p.longitude;
  const y = p.latitude;
  const x1 = lineStart.longitude;
  const y1 = lineStart.latitude;
  const x2 = lineEnd.longitude;
  const y2 = lineEnd.latitude;

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return Math.hypot(x - x1, y - y1);
  }

  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(x - projX, y - projY);
}

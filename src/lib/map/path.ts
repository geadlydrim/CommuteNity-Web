/**
 * Street paths as data: Google encoded polylines at precision 5 (about 1 m),
 * plus the geometry the routing endpoint and the browser share: decoding
 * Valhalla's precision-6 shapes, Douglas–Peucker simplification in metres,
 * and joining a path's ends to its pins (ADR 0004, ADR 0007).
 *
 * No "use client" and no dependencies: plain numbers and strings, importable
 * from route handlers, server-rendered thumbnails, and the browser alike.
 */

/** Same `lng` spelling as pins and react-map-gl. */
export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;
const DEG_TO_RAD = Math.PI / 180;

/** Decimal places of a stored path: about 1 m. */
const STORED_PRECISION = 5;
/** Decimal places of Valhalla's shapes. */
const VALHALLA_PRECISION = 6;

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

function encodeValue(out: string[], delta: number): void {
  let v = delta < 0 ? ~(delta << 1) : delta << 1;
  while (v >= 0x20) {
    out.push(String.fromCharCode((0x20 | (v & 0x1f)) + 63));
    v >>>= 5;
  }
  out.push(String.fromCharCode(v + 63));
}

/** Encodes points as a precision-5 polyline; coordinates are rounded to 5 decimals. */
export function encodePath(points: readonly LatLng[]): string {
  const factor = 10 ** STORED_PRECISION;
  const out: string[] = [];
  let prevLat = 0;
  let prevLng = 0;
  for (const p of points) {
    const lat = Math.round(p.lat * factor);
    const lng = Math.round(p.lng * factor);
    encodeValue(out, lat - prevLat);
    encodeValue(out, lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out.join("");
}

function decode(encoded: string, precision: number): LatLng[] {
  const factor = 10 ** precision;
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const next = (): number => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      if (index >= encoded.length) throw new RangeError("Encoded path ends mid-value");
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new RangeError("Encoded path has an invalid character");
      if (shift >= 30) throw new RangeError("Encoded path has an oversized value");
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ lat: lat / factor, lng: lng / factor });
  }
  return points;
}

/** Decodes a precision-5 polyline. Throws `RangeError` on a malformed string. */
export function decodePath(encoded: string): LatLng[] {
  return decode(encoded, STORED_PRECISION);
}

/** Decodes a precision-6 polyline, the format of Valhalla's shapes. Throws `RangeError` on a malformed string. */
export function decodePath6(encoded: string): LatLng[] {
  return decode(encoded, VALHALLA_PRECISION);
}

// ---------------------------------------------------------------------------
// Distances
// ---------------------------------------------------------------------------

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * DEG_TO_RAD) * Math.cos(b.lat * DEG_TO_RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Sum of the straight-line distances between consecutive points, in metres. */
export function chainDistanceMeters(points: readonly LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1]!, points[i]!);
  }
  return total;
}

/**
 * Distance in metres from `p` to the segment `a`–`b`, on a flat plane scaled
 * at the segment's mean latitude (error far below a metre at path scale).
 */
export function distanceToSegmentMeters(p: LatLng, a: LatLng, b: LatLng): number {
  const mPerDegLat = EARTH_RADIUS_M * DEG_TO_RAD;
  const mPerDegLng = mPerDegLat * Math.cos(((a.lat + b.lat) / 2) * DEG_TO_RAD);
  const dx = (b.lng - a.lng) * mPerDegLng;
  const dy = (b.lat - a.lat) * mPerDegLat;
  const px = (p.lng - a.lng) * mPerDegLng;
  const py = (p.lat - a.lat) * mPerDegLat;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
  return Math.hypot(px - t * dx, py - t * dy);
}

// ---------------------------------------------------------------------------
// Simplification and joining
// ---------------------------------------------------------------------------

/**
 * Douglas–Peucker: drops points until every dropped point is within
 * `toleranceMeters` of the simplified line. The first and last points stay.
 * Iterative, so a path of any length is safe.
 */
export function simplifyPath(points: readonly LatLng[], toleranceMeters: number): LatLng[] {
  if (points.length < 3) return [...points];

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let farthestDistance = toleranceMeters;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegmentMeters(points[i]!, points[first]!, points[last]!);
      if (d > farthestDistance) {
        farthest = i;
        farthestDistance = d;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([first, farthest], [farthest, last]);
    }
  }

  return points.filter((_, i) => keep[i] === 1);
}

function sameStoredPoint(a: LatLng, b: LatLng): boolean {
  const factor = 10 ** STORED_PRECISION;
  return (
    Math.round(a.lat * factor) === Math.round(b.lat * factor) &&
    Math.round(a.lng * factor) === Math.round(b.lng * factor)
  );
}

/**
 * Makes a path start exactly at `start` and end exactly at `end`: each pin is
 * prepended or appended when the router's snapped end differs from it (ends
 * that encode to the same precision-5 point count as matching). An empty path
 * becomes the straight line between the pins.
 */
export function joinEnds(points: readonly LatLng[], start: LatLng, end: LatLng): LatLng[] {
  const first = points[0];
  const last = points[points.length - 1];
  const out = [...points];
  if (!first || !sameStoredPoint(first, start)) out.unshift(start);
  if (!last || !sameStoredPoint(last, end)) out.push(end);
  return out;
}

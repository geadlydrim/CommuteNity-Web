/**
 * Deterministic street-path fixtures for the size-fitting tests: no network,
 * no randomness, so expected values stay stable between runs.
 */
import type { LatLng } from "@/lib/map/path";

const METERS_PER_DEGREE_LAT = 111_320;

function metersPerDegreeLng(lat: number): number {
  return METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180);
}

/**
 * A straight eastward road sampled every `stepMeters`, with one sideways spike
 * per amplitude: `gapSamples` plain samples, then a sample `amplitude` metres
 * north (south when negative). Douglas–Peucker keeps an isolated spike only
 * while its amplitude exceeds the tolerance, so a road mixing amplitudes
 * shrinks in stages as the tolerance grows. The default gap (200 m) isolates
 * the spikes; a gap of 1 gives a dense zig-zag that survives any tolerance
 * below the amplitude.
 */
export function spikyRoad(
  start: LatLng,
  amplitudesMeters: readonly number[],
  { gapSamples = 20, stepMeters = 10 } = {},
): LatLng[] {
  const dLng = stepMeters / metersPerDegreeLng(start.lat);
  const points: LatLng[] = [start];
  let lng = start.lng;
  for (const amplitude of amplitudesMeters) {
    for (let i = 0; i < gapSamples; i++) {
      lng += dLng;
      points.push({ lat: start.lat, lng });
    }
    lng += dLng;
    points.push({ lat: start.lat + amplitude / METERS_PER_DEGREE_LAT, lng });
  }
  return points;
}

/** Sine-hash noise in [-1, 1], the same for the same index. */
function noise(index: number, salt: number): number {
  const x = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export interface StreetRun {
  /** Compass bearing in degrees: 0 north, 90 east. */
  bearingDegrees: number;
  lengthMeters: number;
}

/**
 * A city route: straight runs joined by corners, sampled every `stepMeters`
 * with up to `jitterMeters` of sideways wobble per sample (the unsimplified
 * output of a router). A 2 m simplification removes the wobble and keeps the corners.
 */
export function streetWalk(
  start: LatLng,
  runs: readonly StreetRun[],
  { stepMeters = 10, jitterMeters = 0.8 } = {},
): LatLng[] {
  const points: LatLng[] = [start];
  let lat = start.lat;
  let lng = start.lng;
  let index = 0;
  for (const run of runs) {
    const bearing = (run.bearingDegrees * Math.PI) / 180;
    const steps = Math.round(run.lengthMeters / stepMeters);
    for (let i = 0; i < steps; i++) {
      index += 1;
      const north = Math.cos(bearing) * stepMeters;
      const east = Math.sin(bearing) * stepMeters;
      lat += north / METERS_PER_DEGREE_LAT;
      lng += east / metersPerDegreeLng(lat);
      points.push({
        lat: lat + (jitterMeters * noise(index, 1)) / METERS_PER_DEGREE_LAT,
        lng: lng + (jitterMeters * noise(index, 2)) / metersPerDegreeLng(lat),
      });
    }
  }
  return points;
}

/** Twelve runs of 700–1000 m turning between roughly east, north, and south-east: about 10 km. */
export function crosstownRuns(seed: number): StreetRun[] {
  const bearings = [90, 10, 80, 170, 100, 5, 95, 160, 85, 15, 90, 175];
  return bearings.map((bearing, i) => ({
    bearingDegrees: bearing + (seed % 7),
    lengthMeters: 700 + Math.round(((noise(i + seed, 3) + 1) / 2) * 300),
  }));
}

/**
 * A valid encoded path of exactly `length` characters (at least 2) that wanders
 * a few metres between points: filler for documents that must reach an exact
 * size. Points take two characters, or three for the one that absorbs an odd
 * length. Only characters JSON writes as themselves, so the JSON length matches.
 */
export function fillerPath(length: number, salt = 0): string {
  if (length < 2) throw new RangeError("A path needs at least one point (2 characters)");
  // Values 0-31 fit one character (offset 63); skip 29, which would be a backslash.
  const small = (i: number): string => {
    const k = Math.floor(((noise(i, salt + 5) + 1) / 2) * 30.999);
    return String.fromCharCode(63 + (k >= 29 ? k + 1 : k));
  };
  const chars: string[] = [];
  if (length % 2 === 1) {
    // A two-character latitude step (continuation bit set), then a one-character longitude step.
    chars.push(String.fromCharCode(0x20 + 63 + 1), "@", small(0));
  }
  for (let i = 1; chars.length < length; i++) chars.push(small(i), small(i + 10_000));
  return chars.join("");
}

/**
 * Pure geometry helpers shared by:
 *   - StaticTileCanvas / StaticPostMap (tile projection, fit-to-view, drawn line)
 *   - PostMapBuilder (Source/Layer LineString)
 *   - FocusPostMap (MapView initialViewState, drawn line)
 *
 * No "use client" — this is plain math, importable anywhere. The stored-path
 * decoder (`@/lib/map/path`) is pure too, so server-rendered thumbnails can use it.
 */
import { decodePath, type LatLng } from "@/lib/map/path";
import type { MapData, MapPin } from "@/lib/schemas/post-map";

// ---------------------------------------------------------------------------
// GeoJSON helpers
// ---------------------------------------------------------------------------

export interface PostMapLineString {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: [number, number][]; // [lng, lat]
  };
  properties: Record<string, never>;
}

/** Build a straight GeoJSON LineString through the pins in order. */
export function lineStringFromPins(pins: MapPin[]): PostMapLineString {
  return lineStringFromPoints(pins);
}

/** Build a GeoJSON LineString through the points in order. */
export function lineStringFromPoints(points: readonly LatLng[]): PostMapLineString {
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: points.map((p) => [p.lng, p.lat]),
    },
    properties: {},
  };
}

// ---------------------------------------------------------------------------
// Stored street paths
// ---------------------------------------------------------------------------

/**
 * The points of a stored path, or `null` when there is nothing to draw: no
 * path, or one that doesn't decode to a line (a bad stored string draws as a
 * straight line rather than breaking the feed).
 */
export function storedPathPoints(path: string | null): LatLng[] | null {
  if (path === null) return null;
  try {
    const points = decodePath(path);
    return points.length >= 2 ? points : null;
  } catch {
    return null;
  }
}

const toLatLng = ({ lat, lng }: LatLng): LatLng => ({ lat, lng });

/**
 * The line drawn between pins `index` and `index + 1`: the stored street path
 * as written, or the straight line between the two pins when the pair has none.
 */
export function pairLinePoints(map: MapData, index: number): LatLng[] {
  const from = map.pins[index];
  const to = map.pins[index + 1];
  if (!from || !to) return [];
  return storedPathPoints(map.paths[index] ?? null) ?? [toLatLng(from), toLatLng(to)];
}

/**
 * The whole post-map line, pair by pair. A pair's end and the next pair's
 * start are the same pin, so that point appears once.
 */
export function postMapLinePoints(map: MapData): LatLng[] {
  const line: LatLng[] = [];
  for (let i = 0; i < map.pins.length - 1; i++) {
    const pair = pairLinePoints(map, i);
    const last = line[line.length - 1];
    const skipFirst = last !== undefined && pair[0]?.lat === last.lat && pair[0]?.lng === last.lng;
    line.push(...(skipFirst ? pair.slice(1) : pair));
  }
  return line;
}

/** Everything framing must keep in view: every pin plus every stored path point. */
export function postMapFramingPoints(map: MapData): LatLng[] {
  const points = map.pins.map(toLatLng);
  for (const path of map.paths) {
    const decoded = storedPathPoints(path);
    if (decoded) for (const p of decoded) points.push(p);
  }
  return points;
}

export interface PointBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Smallest lat/lng box containing every point; `null` for no points. */
export function pointBounds(points: readonly LatLng[]): PointBounds | null {
  const first = points[0];
  if (!first) return null;
  const bounds = { minLat: first.lat, maxLat: first.lat, minLng: first.lng, maxLng: first.lng };
  for (const p of points) {
    if (p.lat < bounds.minLat) bounds.minLat = p.lat;
    if (p.lat > bounds.maxLat) bounds.maxLat = p.lat;
    if (p.lng < bounds.minLng) bounds.minLng = p.lng;
    if (p.lng > bounds.maxLng) bounds.maxLng = p.lng;
  }
  return bounds;
}

// ---------------------------------------------------------------------------
// Web Mercator projection (256-px tiles)
// ---------------------------------------------------------------------------

const TILE_SIZE = 256;

export function worldX(lng: number, z: number): number {
  return ((lng + 180) / 360) * TILE_SIZE * Math.pow(2, z);
}

export function worldY(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    TILE_SIZE *
    Math.pow(2, z)
  );
}

// ---------------------------------------------------------------------------
// Fit-to-view
// ---------------------------------------------------------------------------

const MIN_ZOOM = 3;
const MAX_ZOOM = 18;
const PAD_PX = 32; // pixels of padding inside the container

export interface FitResult {
  longitude: number;
  latitude: number;
  zoom: number;
}

/**
 * Compute the best center + integer zoom level to fit all points inside a
 * container of (width × height) pixels with PAD_PX padding on each edge.
 * Guides reuse this with their pins plus their paths' points.
 *
 * Falls back to Metro Manila defaults when there are no points.
 */
export function fitPointsToView(
  points: readonly LatLng[],
  width: number,
  height: number
): FitResult {
  const bounds = pointBounds(points);
  if (!bounds) {
    return { longitude: 120.9842, latitude: 14.5995, zoom: 11 };
  }

  const { minLat, maxLat, minLng, maxLng } = bounds;
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // Degenerate / single point → fixed zoom so we don't overshoot
  if (maxLng - minLng < 0.0001 && maxLat - minLat < 0.0001) {
    return { longitude: centerLng, latitude: centerLat, zoom: 14 };
  }

  const fitW = width - 2 * PAD_PX;
  const fitH = height - 2 * PAD_PX;

  // Walk from MAX_ZOOM down until both spans fit; clamp at MIN_ZOOM.
  let zoom = MAX_ZOOM;
  while (zoom > MIN_ZOOM) {
    const spanX = Math.abs(worldX(maxLng, zoom) - worldX(minLng, zoom));
    const spanY = Math.abs(worldY(minLat, zoom) - worldY(maxLat, zoom));
    if (spanX <= fitW && spanY <= fitH) break;
    zoom -= 1;
  }

  return { longitude: centerLng, latitude: centerLat, zoom };
}

/** Fit just the pins (maps with no stored paths yet, e.g. the builders' seeds). */
export function fitPinsToView(pins: readonly MapPin[], width: number, height: number): FitResult {
  return fitPointsToView(pins, width, height);
}

/** Fit a post map: its pins plus every stored path point, so a path that bulges past its pins stays in frame. */
export function fitPostMapToView(map: MapData, width: number, height: number): FitResult {
  return fitPointsToView(postMapFramingPoints(map), width, height);
}

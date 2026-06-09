/**
 * Pure geometry helpers shared by:
 *   - StaticRouteMap (tile projection)
 *   - RouteMapBuilder (Source/Layer LineString)
 *   - PostCard focus view (MapView initialViewState)
 *
 * No "use client" — this is plain math, importable anywhere.
 */
import type { MapPin } from "@/lib/schemas/post-map";

// ---------------------------------------------------------------------------
// GeoJSON helpers
// ---------------------------------------------------------------------------

export interface RouteLineString {
  type: "Feature";
  geometry: {
    type: "LineString";
    coordinates: [number, number][]; // [lng, lat]
  };
  properties: Record<string, never>;
}

/** Build a straight GeoJSON LineString through the pins in order. */
export function lineStringFromPins(pins: MapPin[]): RouteLineString {
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: pins.map((p) => [p.lng, p.lat]),
    },
    properties: {},
  };
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
 * Compute the best center + integer zoom level to fit all pins inside a
 * container of (width × height) pixels with PAD_PX padding on each edge.
 *
 * Falls back to Metro Manila defaults when pins is empty.
 */
export function fitPinsToView(
  pins: MapPin[],
  width: number,
  height: number
): FitResult {
  if (pins.length === 0) {
    return { longitude: 120.9842, latitude: 14.5995, zoom: 11 };
  }

  const lats = pins.map((p) => p.lat);
  const lngs = pins.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;

  // Degenerate / single pin → fixed zoom so we don't overshoot
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

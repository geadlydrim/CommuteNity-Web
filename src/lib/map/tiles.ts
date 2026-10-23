/**
 * The one tile URL source: static thumbnails and the live MapLibre style both
 * load raster tiles from our caching proxy at `/api/tiles/{z}/{x}/{y}` (ADR 0003),
 * never from openstreetmap.org directly.
 *
 * No "use client": plain strings and math, importable from the proxy route too.
 */
import { PH_LAT_RANGE, PH_LNG_RANGE } from "@/lib/schemas/post-map";

const TILE_PATH = "/api/tiles";

/** Highest zoom the proxy serves (OSM's raster tiles stop at 19). */
export const MAX_TILE_ZOOM = 19;

/** Tiles of slack around the Philippine bounds, so views of edge pins aren't cut off. */
const TILE_MARGIN = 1;

/** Same-origin URL of one tile, for `<img src>`. The route answers `image/png`. */
export function tileUrl(z: number, x: number, y: number): string {
  return `${TILE_PATH}/${z}/${x}/${y}`;
}

/**
 * `{z}/{x}/{y}` template for the MapLibre raster source. MapLibre is handed an
 * absolute URL in the browser; on the server (where MapLibre never runs) the
 * template stays relative.
 */
export function tileUrlTemplate(): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}${TILE_PATH}/{z}/{x}/{y}`;
}

// Web-Mercator tile index of a longitude / latitude at zoom z.
function tileX(lng: number, z: number): number {
  return Math.floor(((lng + 180) / 360) * 2 ** z);
}

function tileY(lat: number, z: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** z,
  );
}

/**
 * True for a real tile at zoom 0–19 that intersects the Philippine pin bounds
 * plus a one-tile margin. Everything else is refused by the proxy so it can't
 * be used as an open proxy.
 */
export function isPhilippineTile(z: number, x: number, y: number): boolean {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (z < 0 || z > MAX_TILE_ZOOM) return false;

  const lastTile = 2 ** z - 1;
  if (x < 0 || x > lastTile || y < 0 || y > lastTile) return false;

  // Tile y grows southward, so the northern edge gives the smallest y.
  const xMin = tileX(PH_LNG_RANGE.min, z) - TILE_MARGIN;
  const xMax = tileX(PH_LNG_RANGE.max, z) + TILE_MARGIN;
  const yMin = tileY(PH_LAT_RANGE.max, z) - TILE_MARGIN;
  const yMax = tileY(PH_LAT_RANGE.min, z) + TILE_MARGIN;

  return x >= xMin && x <= xMax && y >= yMin && y <= yMax;
}

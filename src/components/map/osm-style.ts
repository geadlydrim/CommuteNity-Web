import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { MAX_TILE_ZOOM, tileUrlTemplate } from "@/lib/map/tiles";
import { PH_LAT_RANGE, PH_LNG_RANGE } from "@/lib/schemas/post-map";

// Tiles come through our caching, Philippines-only proxy (ADR 0003); the URL
// lives in `@/lib/map/tiles`, shared with the static thumbnails. To move to
// MapTiler, Protomaps, or a self-hosted server, change the proxy, not this style.
export const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: [tileUrlTemplate()],
      tileSize: 256,
      maxzoom: MAX_TILE_ZOOM,
      // Only request tiles the proxy serves (it refuses everything outside the Philippines).
      bounds: [PH_LNG_RANGE.min, PH_LAT_RANGE.min, PH_LNG_RANGE.max, PH_LAT_RANGE.max],
      // Required by OSM tile usage policy.
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
} as StyleSpecification;

/** Metro Manila geographic center. */
export const METRO_MANILA_CENTER = {
  longitude: 120.9842,
  latitude: 14.5995,
} as const;

export const DEFAULT_ZOOM = 11;

/** Default camera state — reuse across all map screens. */
export const DEFAULT_VIEW_STATE = {
  longitude: METRO_MANILA_CENTER.longitude,
  latitude: METRO_MANILA_CENTER.latitude,
  zoom: DEFAULT_ZOOM,
} as const;

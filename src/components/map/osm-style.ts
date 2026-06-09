import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";

// NOTE: tile.openstreetmap.org is suitable for dev and low-traffic only.
// Under real load, swap the tiles array here to a self-hosted raster proxy,
// MapTiler, or Protomaps vector style — this file is the single swap point.
export const OSM_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
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

"use client";
// Centralised map exports — import all map pieces from "@/components/map",
// never directly from "react-map-gl/maplibre", so a library swap stays contained.
// "use client" required: re-exports include MapProvider (createContext) and other
// client-only primitives. Import osm-style.ts directly in server contexts.

export { MapView, type MapViewProps, type MapRef } from "./map-view";
export {
  OSM_RASTER_STYLE,
  DEFAULT_VIEW_STATE,
  DEFAULT_ZOOM,
  METRO_MANILA_CENTER,
} from "./osm-style";

// react-map-gl/maplibre primitives (Map default intentionally omitted — use <MapView>)
export {
  Marker,
  Popup,
  Source,
  Layer,
  NavigationControl,
  GeolocateControl,
  AttributionControl,
  useMap,
  MapProvider,
} from "react-map-gl/maplibre";

export type {
  MapLayerMouseEvent,
  ViewState,
  ViewStateChangeEvent,
} from "react-map-gl/maplibre";

export type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";

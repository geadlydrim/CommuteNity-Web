"use client";
// Interactive map primitives for use INSIDE src/components/map/ only (builders,
// focus map). This is the one place that re-exports react-map-gl, so a library
// swap stays contained. Code outside this folder uses the server-safe barrel
// (`@/components/map`) or loads interactive maps by path with next/dynamic.

export { MapView, type MapViewProps, type MapRef } from "./map-view";

export { Marker, Popup, Source, Layer, NavigationControl } from "react-map-gl/maplibre";

export type { MapLayerMouseEvent, ViewState, ViewStateChangeEvent } from "react-map-gl/maplibre";

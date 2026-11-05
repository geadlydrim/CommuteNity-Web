"use client";
/**
 * FocusPostMap — the interactive post map shown only in the focus view
 * (one WebGL context; the feed uses StaticPostMap, ADR 0005).
 *
 * Pulls in MapLibre, so callers load it with `next/dynamic` to keep it out of
 * the feed bundle.
 */
import { useState } from "react";
import { MapView, Marker, Popup, Source, Layer } from "./primitives";
import {
  lineStringFromPoints,
  pointBounds,
  postMapFramingPoints,
  postMapLinePoints,
} from "./post-map-geometry";
import { POST_MAP_LINE_COLOR, pinColor } from "@/lib/map/colors";
import type { MapData } from "@/lib/schemas/post-map";

/**
 * Room around the framed points, in container pixels: a pin marker is 27x41
 * and anchored at its foot, so the top needs its full height, and the
 * navigation control covers the top-right corner.
 */
const FRAME_PADDING = { top: 56, right: 56, bottom: 40, left: 40 } as const;
/** A map whose pins all sit on one spot would otherwise zoom to the tile limit. */
const FRAME_MAX_ZOOM = 15;

/**
 * The opening camera: pins plus every stored path point, fitted by MapLibre at
 * the container's real size. (`fitPointsToView` counts 256-px tiles, one
 * MapLibre zoom level deeper than its 512-px world, so its zoom can't be used.)
 */
function framingView(map: MapData) {
  const box = pointBounds(postMapFramingPoints(map));
  if (!box) return undefined;
  return {
    bounds: [
      [box.minLng, box.minLat],
      [box.maxLng, box.maxLat],
    ] as [[number, number], [number, number]],
    fitBoundsOptions: { padding: FRAME_PADDING, maxZoom: FRAME_MAX_ZOOM },
  };
}

export function FocusPostMap({ map }: { map: MapData }) {
  const { pins } = map;
  const [activePopup, setActivePopup] = useState<number | null>(null);
  const [initialViewState] = useState(() => framingView(map));
  const lineData = pins.length >= 2 ? lineStringFromPoints(postMapLinePoints(map)) : null;

  return (
    <div className="mt-3 w-full">
      <MapView
        className="h-[220px] overflow-hidden rounded-lg sm:h-[320px]"
        interactive
        cooperativeGestures
        restrictToPhilippines
        showNavigationControl
        initialViewState={initialViewState}
      >
        {lineData && (
          <Source id="focus-post-map-line" type="geojson" data={lineData}>
            <Layer
              id="focus-post-map-line-layer"
              type="line"
              paint={{
                "line-color": POST_MAP_LINE_COLOR,
                "line-width": 3,
                "line-opacity": 0.85,
              }}
              layout={{ "line-join": "round", "line-cap": "round" }}
            />
          </Source>
        )}
        {pins.map((pin, i) => (
          <Marker
            key={i}
            longitude={pin.lng}
            latitude={pin.lat}
            color={pinColor(i, pins.length)}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setActivePopup(activePopup === i ? null : i);
            }}
          />
        ))}
        {activePopup !== null && pins[activePopup] && (
          <Popup
            longitude={pins[activePopup].lng}
            latitude={pins[activePopup].lat}
            onClose={() => setActivePopup(null)}
            closeButton={false}
            anchor="bottom"
          >
            <p className="text-xs font-medium max-w-[180px] leading-tight">
              {pins[activePopup].label}
            </p>
            {pins[activePopup].sublabel && (
              <p className="text-[10px] text-muted-foreground max-w-[180px] leading-tight mt-0.5">
                {pins[activePopup].sublabel}
              </p>
            )}
          </Popup>
        )}
      </MapView>
    </div>
  );
}

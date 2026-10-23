"use client";
/**
 * FocusPostMap — the interactive post map shown only in the focus view
 * (one WebGL context; the feed uses StaticRouteMap, ADR 0005).
 *
 * Pulls in MapLibre, so callers load it with `next/dynamic` to keep it out of
 * the feed bundle.
 */
import { useState } from "react";
import { MapView, Marker, Popup, Source, Layer } from "./primitives";
import { lineStringFromPins, fitPinsToView } from "./route-geometry";
import { POST_MAP_LINE_COLOR, pinColor } from "@/lib/map/colors";
import type { MapPin } from "@/lib/schemas/post-map";

export function FocusPostMap({ pins }: { pins: MapPin[] }) {
  const [activePopup, setActivePopup] = useState<number | null>(null);
  const fit = fitPinsToView(pins, 600, 320);
  const lineData = pins.length >= 2 ? lineStringFromPins(pins) : null;

  return (
    <div className="mt-3 w-full">
      <MapView
        className="h-[220px] overflow-hidden rounded-lg sm:h-[320px]"
        interactive
        cooperativeGestures
        showNavigationControl
        initialViewState={fit}
      >
        {lineData && (
          <Source id="focus-route-line" type="geojson" data={lineData}>
            <Layer
              id="focus-route-line-layer"
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

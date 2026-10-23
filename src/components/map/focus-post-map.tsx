"use client";
/**
 * FocusPostMap — the interactive post map shown only in the focus view
 * (one WebGL context; the feed uses StaticRouteMap, ADR 0005).
 *
 * Pulls in MapLibre, so callers load it with `next/dynamic` to keep it out of
 * the feed bundle.
 */
import { useState } from "react";
import { MapView } from "./map-view";
import { Marker, Popup, Source, Layer } from "react-map-gl/maplibre";
import { lineStringFromPins, fitPinsToView } from "./route-geometry";
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
                "line-color": "#3b82f6",
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
            color={i === 0 ? "#22c55e" : i === pins.length - 1 ? "#ef4444" : "#6b7280"}
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

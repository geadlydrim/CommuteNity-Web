// PROTOTYPE — throwaway (issue #4)
"use client";
/**
 * Variant C — "Reshape mode": no drag-on-line gesture. The panel's per-leg
 * "Reshape" button enters an explicit mode for one leg; map taps then add vias
 * to it, numbered markers drag to move, the panel lists/removes them.
 */
import { useState } from "react";
import { X } from "lucide-react";
import {
  MAX_VIAS_PER_LEG,
  type LngLat,
  type ReshapeVariant,
  type VariantHook,
} from "./contract";
import { nearestInsertIndex } from "./state";
import { Layer, Marker, Source } from "../primitives";

const WORLD: GeoJSON.Feature<GeoJSON.Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [-180, -85],
        [180, -85],
        [180, 85],
        [-180, 85],
        [-180, -85],
      ],
    ],
  },
};

const btn =
  "inline-flex min-h-7 items-center justify-center rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50";

export const useVariantC: VariantHook = ({ legs, viaState, routes }) => {
  const [activeLegId, setActiveLegId] = useState<string | null>(null);
  const activeLeg = legs.find((l) => l.id === activeLegId) ?? null;
  const activeVias = activeLeg ? (viaState.vias[activeLeg.id] ?? []) : [];
  const atMax = activeVias.length >= MAX_VIAS_PER_LEG;

  const onMapClick: ReshapeVariant["onMapClick"] = (e) => {
    if (!activeLeg) return false;
    if (!atMax) {
      const point: LngLat = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      viaState.addVia(
        activeLeg.id,
        nearestInsertIndex(activeLeg, activeVias, point),
        point
      );
    }
    return true;
  };

  const activeCoords = activeLeg ? (routes[activeLeg.id]?.coords ?? []) : [];

  const mapChildren = activeLeg && (
    <>
      {/* Dim everything under, then redraw the active leg on top. */}
      <Source id="variant-c-dim" type="geojson" data={WORLD}>
        <Layer
          id="variant-c-dim-layer"
          type="fill"
          paint={{ "fill-color": "#000000", "fill-opacity": 0.3 }}
        />
      </Source>
      <Source
        id="variant-c-active"
        type="geojson"
        data={{
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: activeCoords },
        }}
      >
        <Layer
          id="variant-c-active-casing"
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": "#ffffff", "line-width": 9 }}
        />
        <Layer
          id="variant-c-active-line"
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{ "line-color": activeLeg.color, "line-width": 5 }}
        />
      </Source>

      {activeVias.map((v, i) => (
        <Marker
          key={v.id}
          longitude={v.lng}
          latitude={v.lat}
          draggable
          onClick={(e) => e.originalEvent.stopPropagation()}
          onDragEnd={(e) =>
            viaState.moveVia(activeLeg.id, v.id, {
              lat: e.lngLat.lat,
              lng: e.lngLat.lng,
            })
          }
        >
          <div
            className="flex h-8 w-8 cursor-grab items-center justify-center rounded-full border-2 border-white text-sm font-bold text-white shadow-md active:cursor-grabbing"
            style={{ backgroundColor: activeLeg.color, touchAction: "none" }}
          >
            {i + 1}
          </div>
        </Marker>
      ))}

      <div className="pointer-events-none absolute inset-x-0 top-2 z-10 flex justify-center px-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-background/95 py-1 pl-3 pr-1 text-xs shadow-md">
          <span>
            Reshaping Leg {activeLeg.index} — tap the map to add a via
          </span>
          <button
            onClick={() => setActiveLegId(null)}
            className="min-h-7 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );

  const panel = activeLeg ? (
    <div className="space-y-2 rounded-md border bg-card p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          Reshaping Leg {activeLeg.index} · {activeVias.length}{" "}
          {activeVias.length === 1 ? "via" : "vias"}
          {routes[activeLeg.id]?.status === "routing" && (
            <span className="ml-1.5 text-muted-foreground">routing…</span>
          )}
        </span>
        <button onClick={() => setActiveLegId(null)} className={btn}>
          Done
        </button>
      </div>

      {atMax ? (
        <p className="text-amber-600">
          Leg {activeLeg.index} has the maximum {MAX_VIAS_PER_LEG} vias.
        </p>
      ) : (
        <p className="text-muted-foreground">
          Tap the map to add a via. Drag a numbered marker to move it.
        </p>
      )}

      {activeVias.length > 0 ? (
        <ol className="space-y-1">
          {activeVias.map((v, i) => (
            <li
              key={v.id}
              className="flex items-center gap-2 rounded border bg-muted/30 py-0.5 pl-1.5 pr-0.5"
            >
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: activeLeg.color }}
              >
                {i + 1}
              </span>
              <span className="font-medium">Via {i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                {v.lat.toFixed(5)}, {v.lng.toFixed(5)}
              </span>
              <button
                onClick={() => viaState.removeVia(activeLeg.id, v.id)}
                title={`Remove via ${i + 1}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-destructive hover:bg-destructive/20"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground">No vias yet.</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={viaState.undo}
          disabled={!viaState.canUndo}
          className={btn}
        >
          Undo
        </button>
        <button
          onClick={() => {
            for (const v of activeVias) viaState.removeVia(activeLeg.id, v.id);
          }}
          disabled={activeVias.length === 0}
          className={btn}
        >
          Clear all
        </button>
      </div>
    </div>
  ) : (
    <div className="space-y-1.5 rounded-md border bg-card p-2.5 text-xs">
      <div className="font-medium uppercase tracking-wide text-[10px] text-muted-foreground">
        Reshape street paths
      </div>
      {legs.length === 0 && (
        <p className="text-muted-foreground">Place a leg&apos;s pins to reshape it.</p>
      )}
      {legs.map((l) => {
        const n = (viaState.vias[l.id] ?? []).length;
        return (
          <div key={l.id} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: l.color }}
              />
              Leg {l.index} · {n} {n === 1 ? "via" : "vias"}
            </span>
            <button onClick={() => setActiveLegId(l.id)} className={btn}>
              Reshape
            </button>
          </div>
        );
      })}
    </div>
  );

  return { mapChildren, panel, onMapClick };
};

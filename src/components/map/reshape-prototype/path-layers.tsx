"use client";
/** PROTOTYPE — throwaway (issue #4) */
import type { LegRoute, ProtoLeg, Via } from "./contract";
import { Layer, Source } from "../primitives";

export const pathLayerId = (legId: string) => `reshape-path-layer-${legId}`;

export function PathLayers({
  legs,
  routes,
  vias,
}: {
  legs: ProtoLeg[];
  routes: Record<string, LegRoute>;
  vias: Record<string, Via[]>;
}) {
  const routing = legs.some((l) => routes[l.id]?.status === "routing");
  const failed = legs.filter((l) => routes[l.id]?.status === "failed");

  const viaFeatures = legs.flatMap((l) =>
    (vias[l.id] ?? []).map((v) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [v.lng, v.lat] },
      properties: { color: l.color },
    }))
  );

  return (
    <>
      {legs.map((leg) => {
        const route = routes[leg.id];
        const status = route?.status ?? "ok";
        const coords =
          route?.coords ?? [
            [leg.origin.lng, leg.origin.lat],
            [leg.destination.lng, leg.destination.lat],
          ];
        const dashed = status !== "ok";
        return (
          <Source
            key={leg.id}
            id={`reshape-path-${leg.id}`}
            type="geojson"
            data={{
              type: "Feature",
              geometry: { type: "LineString", coordinates: coords },
              properties: {},
            }}
          >
            <Layer
              id={pathLayerId(leg.id)}
              type="line"
              paint={{
                "line-color": leg.color,
                "line-width": 5,
                "line-opacity": status === "routing" ? 0.45 : 0.9,
                "line-dasharray": dashed ? [2, 2] : [1, 0],
              }}
              layout={{ "line-join": "round", "line-cap": "round" }}
            />
          </Source>
        );
      })}
      <Source
        id="reshape-vias"
        type="geojson"
        data={{ type: "FeatureCollection", features: viaFeatures }}
      >
        <Layer
          id="reshape-vias-layer"
          type="circle"
          paint={{
            "circle-radius": 6,
            "circle-color": "#ffffff",
            "circle-stroke-color": ["get", "color"],
            "circle-stroke-width": 3,
          }}
        />
      </Source>
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col items-start gap-1.5">
        {routing && (
          <div className="rounded-full bg-background/95 px-3 py-1 text-xs font-medium shadow ring-1 ring-border">
            Routing…
          </div>
        )}
        {failed.map((l) => (
          <div
            key={l.id}
            className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white shadow"
          >
            Couldn&apos;t reshape Leg {l.index} — showing a straight line
          </div>
        ))}
      </div>
    </>
  );
}

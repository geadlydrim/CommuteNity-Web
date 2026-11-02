"use client";
/**
 * PROTOTYPE — throwaway (issue #4)
 *
 * Variant A — "Drag the line" (Google Maps style). Press a leg's path and drag
 * to pull a via out of it; release commits. Existing vias are draggable
 * markers (double-click / long-press removes).
 */
import { useEffect, useRef, useState } from "react";
import type { Map as MaplibreMap, MapMouseEvent, MapTouchEvent } from "maplibre-gl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Layer, Marker, Source, type MapLayerMouseEvent } from "../primitives";
import {
  MAX_VIAS_PER_LEG,
  type LngLat,
  type ProtoLeg,
  type VariantHook,
  type Via,
} from "./contract";
import { nearestInsertIndex } from "./state";

const VIA_ATTR = "data-variant-a-via";
const LONG_PRESS_MS = 500;
const DRAG_THRESHOLD_PX = 4;
const MOUSE_HIT_PAD = 6;
const TOUCH_HIT_PAD = 14;
/** A click this soon after a drag ended is the tail of that drag, not a new pin. */
const CLICK_SUPPRESS_MS = 400;

/** The path being redrawn while a via is dragged (new or existing). */
type Ghost = {
  legId: string;
  /** Position in the leg's via list the dragged point occupies. */
  index: number;
  /** Set when an existing via is being moved (it is replaced, not inserted). */
  viaId?: string;
  point: LngLat;
};

function ghostCoords(leg: ProtoLeg, vias: Via[], g: Ghost): [number, number][] {
  const rest = g.viaId ? vias.filter((v) => v.id !== g.viaId) : vias;
  const seq: LngLat[] = [
    leg.origin,
    ...rest.slice(0, g.index),
    g.point,
    ...rest.slice(g.index),
    leg.destination,
  ];
  return seq.map((p) => [p.lng, p.lat]);
}

export const useVariantA: VariantHook = (props) => {
  const { legs, mapRef, viaState, active } = props;
  const [map, setMap] = useState<MaplibreMap | null>(null);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const endedAt = useRef(0);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pressStart = useRef({ x: 0, y: 0 });
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  // The builder's map mounts after this hook first runs; keep the instance current.
  useEffect(() => {
    const id = setInterval(() => {
      const m = mapRef.current?.getMap();
      if (m) setMap((prev) => (prev === m ? prev : m));
    }, 200);
    return () => clearInterval(id);
  }, [mapRef]);

  const legKey = legs.map((l) => l.id).join(",");

  useEffect(() => {
    if (!map || !active) return;
    const canvas = map.getCanvas();
    const container = map.getCanvasContainer();

    type Drag = {
      legId: string;
      index: number;
      startX: number;
      startY: number;
      moved: boolean;
      last: LngLat;
    };
    let drag: Drag | null = null;

    const legAt = (x: number, y: number, pad: number): ProtoLeg | null => {
      const { legs, pathLayerId } = latest.current;
      const layers = legs.map((l) => pathLayerId(l.id)).filter((id) => map.getLayer(id));
      if (layers.length === 0) return null;
      const f = map.queryRenderedFeatures(
        [
          [x - pad, y - pad],
          [x + pad, y + pad],
        ],
        { layers },
      )[0];
      if (!f) return null;
      return legs.find((l) => pathLayerId(l.id) === f.layer.id) ?? null;
    };

    const blockScroll = (ev: TouchEvent) => ev.preventDefault();

    const finish = () => {
      drag = null;
      map.dragPan.enable();
      container.removeEventListener("touchmove", blockScroll);
      canvas.style.cursor = "";
    };

    const start = (e: MapMouseEvent | MapTouchEvent, pad: number, touch: boolean) => {
      const target = e.originalEvent.target as Element | null;
      if (target?.closest?.(`[${VIA_ATTR}]`)) return;
      const leg = legAt(e.point.x, e.point.y, pad);
      if (!leg) return;
      e.preventDefault();
      map.dragPan.disable();
      if (touch) container.addEventListener("touchmove", blockScroll, { passive: false });
      canvas.style.cursor = "grabbing";
      const at = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      drag = {
        legId: leg.id,
        index: nearestInsertIndex(leg, latest.current.viaState.vias[leg.id] ?? [], at),
        startX: e.point.x,
        startY: e.point.y,
        moved: false,
        last: at,
      };
    };

    const move = (e: MapMouseEvent | MapTouchEvent) => {
      if (!drag) return;
      if ("touches" in e.originalEvent && e.originalEvent.touches.length > 1) {
        finish();
        setGhost(null);
        return;
      }
      if (
        !drag.moved &&
        Math.hypot(e.point.x - drag.startX, e.point.y - drag.startY) < DRAG_THRESHOLD_PX
      ) {
        return;
      }
      drag.moved = true;
      drag.last = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      setGhost({ legId: drag.legId, index: drag.index, point: drag.last });
    };

    const end = () => {
      if (!drag) return;
      const d = drag;
      finish();
      endedAt.current = Date.now();
      setGhost(null);
      if (!d.moved) return;
      const { legs, viaState } = latest.current;
      if (!viaState.addVia(d.legId, d.index, d.last)) {
        const n = legs.find((l) => l.id === d.legId)?.index ?? "?";
        toast(`Leg ${n} already has ${MAX_VIAS_PER_LEG} vias.`);
      }
    };

    const cancel = () => {
      if (!drag) return;
      finish();
      setGhost(null);
    };

    const onMouseDown = (e: MapMouseEvent) => {
      if (e.originalEvent.button !== 0) return;
      start(e, MOUSE_HIT_PAD, false);
    };
    const onTouchStart = (e: MapTouchEvent) => {
      if (e.originalEvent.touches.length !== 1) return;
      start(e, TOUCH_HIT_PAD, true);
    };
    const onMouseMove = (e: MapMouseEvent) => {
      if (drag) {
        move(e);
        return;
      }
      canvas.style.cursor = legAt(e.point.x, e.point.y, MOUSE_HIT_PAD) ? "pointer" : "";
    };

    map.on("mousedown", onMouseDown);
    map.on("touchstart", onTouchStart);
    map.on("mousemove", onMouseMove);
    map.on("touchmove", move);
    map.on("touchend", end);
    map.on("touchcancel", cancel);
    window.addEventListener("mouseup", end);

    return () => {
      map.off("mousedown", onMouseDown);
      map.off("touchstart", onTouchStart);
      map.off("mousemove", onMouseMove);
      map.off("touchmove", move);
      map.off("touchend", end);
      map.off("touchcancel", cancel);
      window.removeEventListener("mouseup", end);
      if (drag) finish();
      canvas.style.cursor = "";
    };
  }, [map, legKey, active]);

  const clearPress = () => {
    clearTimeout(pressTimer.current);
    pressTimer.current = undefined;
  };

  const ghostLeg = ghost ? legs.find((l) => l.id === ghost.legId) : undefined;
  const ghostLine =
    ghost && ghostLeg
      ? {
          type: "FeatureCollection" as const,
          features: [
            {
              type: "Feature" as const,
              properties: {},
              geometry: {
                type: "LineString" as const,
                coordinates: ghostCoords(ghostLeg, viaState.vias[ghostLeg.id] ?? [], ghost),
              },
            },
            // The dragged point itself, for a new via (an existing via's marker follows the pointer).
            ...(ghost.viaId
              ? []
              : [
                  {
                    type: "Feature" as const,
                    properties: {},
                    geometry: {
                      type: "Point" as const,
                      coordinates: [ghost.point.lng, ghost.point.lat],
                    },
                  },
                ]),
          ],
        }
      : null;

  const mapChildren = (
    <>
      {legs.flatMap((leg) =>
        (viaState.vias[leg.id] ?? []).map((via, i) => {
          const dragging = ghost?.viaId === via.id ? ghost.point : null;
          return (
            <Marker
              key={via.id}
              longitude={dragging ? dragging.lng : via.lng}
              latitude={dragging ? dragging.lat : via.lat}
              anchor="center"
              draggable
              onDragStart={() => {
                clearPress();
                setGhost({ legId: leg.id, index: i, viaId: via.id, point: via });
              }}
              onDrag={(e) => {
                setGhost({
                  legId: leg.id,
                  index: i,
                  viaId: via.id,
                  point: { lat: e.lngLat.lat, lng: e.lngLat.lng },
                });
              }}
              onDragEnd={(e) => {
                endedAt.current = Date.now();
                viaState.moveVia(leg.id, via.id, { lat: e.lngLat.lat, lng: e.lngLat.lng });
                setGhost(null);
              }}
            >
              <div
                {...{ [VIA_ATTR]: "" }}
                ref={(el) => {
                  if (!el) return;
                  const onDbl = (ev: MouseEvent) => {
                    ev.stopPropagation(); // no double-click zoom
                    viaState.removeVia(leg.id, via.id);
                  };
                  el.addEventListener("dblclick", onDbl);
                  return () => el.removeEventListener("dblclick", onDbl);
                }}
                onTouchStart={(ev) => {
                  clearPress();
                  const t = ev.touches[0];
                  if (!t) return;
                  pressStart.current = { x: t.clientX, y: t.clientY };
                  pressTimer.current = setTimeout(() => {
                    pressTimer.current = undefined;
                    viaState.removeVia(leg.id, via.id);
                  }, LONG_PRESS_MS);
                }}
                onTouchMove={(ev) => {
                  const t = ev.touches[0];
                  const o = pressStart.current;
                  if (t && Math.hypot(t.clientX - o.x, t.clientY - o.y) > 8) clearPress();
                }}
                onTouchEnd={clearPress}
                onTouchCancel={clearPress}
                className="flex size-8 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
                title="Drag to move; double-click or long-press to remove"
              >
                <div
                  className="size-[18px] rounded-full bg-white shadow-md"
                  style={{ border: `3px solid ${leg.color}` }}
                />
              </div>
            </Marker>
          );
        }),
      )}
      {ghostLine && ghostLeg && (
        <Source id="variant-a-ghost" type="geojson" data={ghostLine}>
          <Layer
            id="variant-a-ghost-line"
            type="line"
            filter={["==", ["geometry-type"], "LineString"]}
            layout={{ "line-cap": "round", "line-join": "round" }}
            paint={{
              "line-color": ghostLeg.color,
              "line-width": 5,
              "line-opacity": 0.85,
              "line-dasharray": [1.5, 1.5],
            }}
          />
          <Layer
            id="variant-a-ghost-point"
            type="circle"
            filter={["==", ["geometry-type"], "Point"]}
            paint={{
              "circle-radius": 9,
              "circle-color": "#ffffff",
              "circle-stroke-color": ghostLeg.color,
              "circle-stroke-width": 3,
            }}
          />
        </Source>
      )}
    </>
  );

  const panel = (
    <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
      <p>Drag a leg&apos;s line to reshape it. Double-click or long-press a via to remove it.</p>
      <ul className="space-y-1">
        {legs.map((leg) => (
          <li key={leg.id} className="flex items-center gap-2">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: leg.color }}
            />
            <span>
              Leg {leg.index}: {(viaState.vias[leg.id] ?? []).length} / {MAX_VIAS_PER_LEG} vias
            </span>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!viaState.canUndo}
        onClick={viaState.undo}
      >
        Undo
      </Button>
    </div>
  );

  const onMapClick = (e: MapLayerMouseEvent) => {
    if (Date.now() - endedAt.current < CLICK_SUPPRESS_MS) return true;
    const target = e.originalEvent.target as Element | null;
    return !!target?.closest?.(`[${VIA_ATTR}]`);
  };

  return { mapChildren, panel, onMapClick };
};

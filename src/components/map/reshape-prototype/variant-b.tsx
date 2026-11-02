"use client";
/** PROTOTYPE — throwaway (issue #4). Variant B: always-visible midpoint "+" handles. */
import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Marker, Popup } from "../primitives";
import {
  MAX_VIAS_PER_LEG,
  type LngLat,
  type ProtoLeg,
  type Via,
  type VariantHook,
} from "./contract";

const mid = (a: LngLat, b: LngLat): LngLat => ({
  lat: (a.lat + b.lat) / 2,
  lng: (a.lng + b.lng) / 2,
});

const sequence = (leg: ProtoLeg, vias: Via[]): LngLat[] => [leg.origin, ...vias, leg.destination];

export const useVariantB: VariantHook = ({ legs, viaState, routes }) => {
  const [selected, setSelected] = useState<{ legId: string; viaId: string } | null>(null);

  const selectedVia = selected
    ? (viaState.vias[selected.legId]?.find((v) => v.id === selected.viaId) ?? null)
    : null;

  const mapChildren = (
    <>
      {legs.map((leg) => {
        const vias = viaState.vias[leg.id] ?? [];
        const pts = sequence(leg, vias);
        const routing = routes[leg.id]?.status === "routing";
        const full = vias.length >= MAX_VIAS_PER_LEG;

        const handles: ReactNode[] = [];
        // No re-render happens mid-drag, so the Marker is never reset under the pointer.
        if (!routing && !full) {
          for (let i = 0; i < pts.length - 1; i++) {
            const m = mid(pts[i]!, pts[i + 1]!);
            handles.push(
              <HandleMarker
                key={`${leg.id}-h-${i}`}
                leg={leg}
                pos={m}
                onDragEnd={(p) => {
                  setSelected(null);
                  viaState.addVia(leg.id, i, p);
                }}
                onTap={() => {
                  setSelected(null);
                  viaState.addVia(leg.id, i, m);
                }}
              />,
            );
          }
        }

        let badge: ReactNode = null;
        if (full) {
          const i = Math.floor((pts.length - 2) / 2);
          const m = mid(pts[i]!, pts[i + 1]!);
          badge = (
            <Marker key={`${leg.id}-badge`} longitude={m.lng} latitude={m.lat} anchor="center">
              <div
                className="pointer-events-none rounded-full border bg-white/90 px-2 py-0.5 text-[11px] font-semibold shadow"
                style={{ borderColor: leg.color, color: leg.color }}
              >
                {MAX_VIAS_PER_LEG}/{MAX_VIAS_PER_LEG} vias
              </div>
            </Marker>
          );
        }

        return (
          <div key={leg.id} className="contents">
            {handles}
            {badge}
            {vias.map((v) => (
              <ViaMarker
                key={v.id}
                leg={leg}
                via={v}
                selected={selected?.viaId === v.id}
                onMove={(p) => viaState.moveVia(leg.id, v.id, p)}
                onTap={() =>
                  setSelected((s) => (s?.viaId === v.id ? null : { legId: leg.id, viaId: v.id }))
                }
              />
            ))}
          </div>
        );
      })}
      {selected && selectedVia && (
        <Popup
          longitude={selectedVia.lng}
          latitude={selectedVia.lat}
          anchor="top"
          offset={20}
          closeButton={false}
          closeOnClick={false}
        >
          <Button
            size="sm"
            variant="destructive"
            className="h-8"
            onClick={() => {
              viaState.removeVia(selected.legId, selected.viaId);
              setSelected(null);
            }}
          >
            Remove
          </Button>
        </Popup>
      )}
    </>
  );

  const panel = (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Reshape (drag a + on a path)</p>
        <Button size="sm" variant="outline" disabled={!viaState.canUndo} onClick={viaState.undo}>
          Undo
        </Button>
      </div>
      {legs.map((leg) => {
        const vias = viaState.vias[leg.id] ?? [];
        return (
          <div key={leg.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">
              <span className="size-3 rounded-full" style={{ background: leg.color }} />
              Leg {leg.index} · {vias.length} {vias.length === 1 ? "via" : "vias"}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={vias.length === 0}
              onClick={() => {
                setSelected(null);
                for (const v of vias) viaState.removeVia(leg.id, v.id);
              }}
            >
              Clear
            </Button>
          </div>
        );
      })}
    </div>
  );

  return {
    mapChildren,
    panel,
    onMapClick: () => {
      if (!selected) return false;
      setSelected(null);
      return true;
    },
  };
};

type HandleProps = {
  leg: ProtoLeg;
  pos: LngLat;
  onDragEnd: (p: LngLat) => void;
  onTap: () => void;
};

/**
 * Tap detection from pointerdown → pointerup distance on the element itself.
 * The DOM `click` that follows a drag is ignored (Marker onClick only stops propagation).
 */
function useTap(onTap: () => void) {
  const down = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      down.current = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const d = down.current;
      down.current = null;
      if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 4) onTap();
    },
  };
}

function HandleMarker({ leg, pos, onDragEnd, onTap }: HandleProps) {
  const tap = useTap(onTap);
  return (
    <Marker
      longitude={pos.lng}
      latitude={pos.lat}
      anchor="center"
      draggable
      onDragEnd={(e) => onDragEnd({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
      onClick={(e) => e.originalEvent.stopPropagation()}
    >
      <div
        {...tap}
        className="flex size-9 cursor-grab touch-none items-center justify-center"
      >
        <div
          className="flex size-6 items-center justify-center rounded-full bg-white/50 text-base leading-none font-bold"
          style={{ border: `2px solid ${leg.color}`, color: leg.color }}
        >
          +
        </div>
      </div>
    </Marker>
  );
}

type ViaMarkerProps = {
  leg: ProtoLeg;
  via: Via;
  selected: boolean;
  onMove: (p: LngLat) => void;
  onTap: () => void;
};

function ViaMarker({ leg, via, selected, onMove, onTap }: ViaMarkerProps) {
  const tap = useTap(onTap);
  return (
    <Marker
      longitude={via.lng}
      latitude={via.lat}
      anchor="center"
      draggable
      onDragEnd={(e) => onMove({ lat: e.lngLat.lat, lng: e.lngLat.lng })}
      onClick={(e) => e.originalEvent.stopPropagation()}
    >
      <div {...tap} className="flex size-8 cursor-grab touch-none items-center justify-center">
        <div
          className="size-4 rounded-full bg-white shadow"
          style={{
            border: `4px solid ${leg.color}`,
            outline: selected ? "2px solid #000" : undefined,
          }}
        />
      </div>
    </Marker>
  );
}

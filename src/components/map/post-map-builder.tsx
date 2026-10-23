"use client";
/**
 * PostMapBuilder — dialog for composing a post map on a post.
 *
 * Slot model: Origin and Destination cards ALWAYS persist (even empty);
 * optional waypoint slots sit between them. Each slot has its own place
 * search field. Click the map (or drag a pin) to fine-tune the active slot.
 * Placement, labeling, and the camera come from the shared map-editing core
 * (`useMapEditor`); this file keeps only the ordered-pins shape.
 *
 * One bounded WebGL context while the dialog is open — no issue.
 */
import { useState } from "react";
import { ArrowUp, ArrowDown, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { GeocodeResult } from "@/lib/geo";
import { POST_MAP_LINE_COLOR, pinColor } from "@/lib/map/colors";
import { CURRENT_POST_MAP_VERSION, mapDataSchema, type MapData, type MapPin } from "@/lib/schemas/post-map";
import { MapView, Marker, Source, Layer } from "./primitives";
import { lineStringFromPins } from "./post-map-geometry";
import { BuilderShell } from "./builder-shell";
import { SlotFields } from "./slot-fields";
import { isPlaced, slotToPin, type EditorSlot, type SeedSlot } from "./map-editor-state";
import { useMapEditor, useOpenSession } from "./use-map-editor";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-populate the builder when re-opening to edit a draft. */
  initialValue: MapData | null;
  /** Called with validated MapData when user clicks Save. */
  onSave: (data: MapData) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_PINS = 10;

function roleLabel(index: number, total: number): string {
  if (index === 0) return "Origin";
  if (index === total - 1) return "Destination";
  return `Waypoint ${index}`;
}

/** The saved pins, or an empty origin and destination. */
function seedSlots(initialValue: MapData | null): SeedSlot[] {
  if (initialValue && initialValue.pins.length >= 2) {
    return initialValue.pins.map((pin) => ({ key: crypto.randomUUID(), pin }));
  }
  return [
    { key: crypto.randomUUID(), pin: null },
    { key: crypto.randomUUID(), pin: null },
  ];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PostMapBuilder(props: Props) {
  // A fresh editor on every open, seeded from the current initialValue.
  const session = useOpenSession(props.open);
  return <PostMapEditor key={session} {...props} />;
}

function PostMapEditor({ open, onOpenChange, initialValue, onSave }: Props) {
  const [seed] = useState(() => seedSlots(initialValue));
  /** Slot keys in pin order: origin, waypoints, destination. */
  const [order, setOrder] = useState(() => seed.map((s) => s.key));
  const editor = useMapEditor({ initialSlots: seed, order });

  // --- Shape mutations ---

  function moveSlot(index: number, dir: -1 | 1) {
    setOrder((prev) => {
      const a = prev[index];
      const b = prev[index + dir];
      if (a === undefined || b === undefined) return prev;
      const updated = [...prev];
      updated[index] = b;
      updated[index + dir] = a;
      return updated;
    });
  }

  function removeSlot(key: string) {
    setOrder((prev) => prev.filter((k) => k !== key));
    editor.removeSlots([key]);
  }

  function addWaypoint() {
    if (order.length >= MAX_PINS) {
      toast.error(`Maximum ${MAX_PINS} pins reached.`);
      return;
    }
    const key = crypto.randomUUID();
    // Insert before the destination (last slot)
    setOrder((prev) => {
      const dest = prev.at(-1);
      return dest !== undefined ? [...prev.slice(0, -1), key, dest] : [...prev, key];
    });
    editor.addSlots([key]);
    editor.select(key);
  }

  // --- Derived ---

  const first = order.at(0);
  const last = order.at(-1);
  const canSave =
    first !== undefined &&
    last !== undefined &&
    isPlaced(editor.slot(first)) &&
    isPlaced(editor.slot(last));
  const pins: MapPin[] = order.flatMap((key) => {
    const slot = editor.slot(key);
    return isPlaced(slot) ? [slotToPin(slot)] : [];
  });
  const lineData = pins.length >= 2 ? lineStringFromPins(pins) : null;

  // --- Save ---

  function handleSave() {
    if (!canSave) {
      toast.error("Set both an origin and a destination.");
      return;
    }
    const result = mapDataSchema.safeParse({ version: CURRENT_POST_MAP_VERSION, pins });
    if (!result.success) {
      toast.error(result.error.issues[0]?.message ?? "Invalid map data");
      return;
    }
    onSave(result.data);
    onOpenChange(false);
  }

  return (
    <BuilderShell
      open={open}
      onOpenChange={onOpenChange}
      title="Add post map"
      description="Search for each place, or click the map to place the selected pin. Drag a pin to fine-tune."
      saveLabel="Save post map"
      canSave={canSave}
      hint={canSave ? null : "Set both an origin and a destination."}
      onSave={handleSave}
      map={
        <MapView
          mapRef={editor.mapRef}
          className="h-full w-full rounded-none"
          onClick={editor.onMapClick}
          onLoad={editor.onMapLoad}
          interactive
          cooperativeGestures
          restrictToPhilippines
          showNavigationControl
          initialViewState={editor.initialViewState}
        >
          {lineData && (
            <Source id="post-map-line" type="geojson" data={lineData}>
              <Layer
                id="post-map-line-layer"
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

          {order.map((key, i) => {
            const slot = editor.slot(key);
            return isPlaced(slot) ? (
              <Marker
                key={key}
                longitude={slot.lng}
                latitude={slot.lat}
                color={pinColor(i, order.length)}
                draggable
                onDragEnd={(e) => {
                  editor.placeAt(key, e.lngLat.lat, e.lngLat.lng);
                }}
              />
            ) : null;
          })}
        </MapView>
      }
      panel={
        <div className="space-y-2">
          {order.map((key, i) => (
            <SlotRow
              key={key}
              slot={editor.slot(key)}
              index={i}
              total={order.length}
              isActive={key === editor.activeKey}
              canRemove={i !== 0 && i !== order.length - 1}
              onSelect={() => editor.select(key)}
              onPick={(r) => editor.pick(key, r)}
              onLabelChange={(v) => editor.setLabel(key, v)}
              onMove={(dir) => moveSlot(i, dir)}
              onRemove={() => removeSlot(key)}
            />
          ))}

          {/* Add waypoint */}
          {order.length < MAX_PINS && (
            <button
              onClick={addWaypoint}
              className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add waypoint
            </button>
          )}
        </div>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// SlotRow — single slot card; owns its own place search
// ---------------------------------------------------------------------------

interface SlotRowProps {
  slot: EditorSlot;
  index: number;
  total: number;
  isActive: boolean;
  canRemove: boolean;
  onSelect: () => void;
  onPick: (result: GeocodeResult) => void;
  onLabelChange: (value: string) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}

function SlotRow({
  slot,
  index,
  total,
  isActive,
  canRemove,
  onSelect,
  onPick,
  onLabelChange,
  onMove,
  onRemove,
}: SlotRowProps) {
  const color = pinColor(index, total);
  const role = roleLabel(index, total);

  return (
    <div
      onClick={onSelect}
      className={cn(
        "rounded-md border bg-card p-2.5 text-xs space-y-2 cursor-pointer transition-shadow",
        isActive ? "ring-2 ring-primary" : "ring-1 ring-border"
      )}
    >
      {/* Role badge + controls */}
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1.5 font-medium">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-[10px] uppercase tracking-wide" style={{ color }}>
            {role}
          </span>
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMove(-1);
            }}
            disabled={index === 0}
            className="p-0.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
            title="Move up"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMove(1);
            }}
            disabled={index === total - 1}
            className="p-0.5 rounded hover:bg-accent disabled:opacity-30 transition-colors"
            title="Move down"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
          {canRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="p-0.5 rounded hover:bg-destructive/20 text-destructive transition-colors"
              title="Remove waypoint"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <SlotFields
        slot={slot}
        role={role}
        onSelect={onSelect}
        onPick={onPick}
        onLabelChange={onLabelChange}
      />
    </div>
  );
}

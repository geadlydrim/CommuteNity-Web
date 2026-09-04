"use client";
/**
 * RouteMapBuilder — dialog for composing a route map on a post.
 *
 * Slot model: Origin and Destination cards ALWAYS persist (even empty);
 * optional waypoint slots sit between them. Each slot has its own location
 * search field. Click the map (or drag a marker) to fine-tune the active slot.
 *
 * One bounded WebGL context while the dialog is open — no issue.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MapPin as MapPinIcon,
  ArrowUp,
  ArrowDown,
  X,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { reverseGeocode } from "@/lib/geo";
import type { GeocodeResult } from "@/lib/geo/types";
import { LocationSearch } from "./location-search";
import { mapDataSchema, type MapData, type MapPin } from "@/lib/schemas/post-map";
import {
  MapView,
  Marker,
  Source,
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
} from "@/components/map";
import { lineStringFromPins, fitPinsToView } from "./route-geometry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A builder slot — may be empty (no coords placed yet). */
interface Slot {
  id: string;
  lat: number | null;
  lng: number | null;
  /** Primary display name — landmark / POI (bold). */
  label: string;
  /** Secondary display name — barangay, city, province (grey sub-line). */
  sublabel: string;
}

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

const PIN_COLORS = {
  origin: "#22c55e",
  destination: "#ef4444",
  waypoint: "#6b7280",
} as const;

function roleColor(index: number, total: number): string {
  if (index === 0) return PIN_COLORS.origin;
  if (index === total - 1) return PIN_COLORS.destination;
  return PIN_COLORS.waypoint;
}

function roleLabel(index: number, total: number): string {
  if (index === 0) return "Origin";
  if (index === total - 1) return "Destination";
  return `Stop ${index}`;
}

function newSlot(): Slot {
  return { id: crypto.randomUUID(), lat: null, lng: null, label: "", sublabel: "" };
}

function hasCoords(s: Slot): s is Slot & { lat: number; lng: number } {
  return s.lat !== null && s.lng !== null;
}

/** Nominatim display_name can exceed 120 chars — clamp before storing. */
function clampLabel(s: string): string {
  return s.trim().slice(0, 120);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function RouteMapBuilder({ open, onOpenChange, initialValue, onSave }: Props) {
  const [slots, setSlots] = useState<Slot[]>([newSlot(), newSlot()]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const mapRef = useRef<MapRef | null>(null);

  // Seed state from initialValue when dialog opens
  useEffect(() => {
    if (!open) return;
    if (initialValue && initialValue.pins.length >= 2) {
      setSlots(
        initialValue.pins.map((p) => ({
          id: crypto.randomUUID(),
          lat: p.lat,
          lng: p.lng,
          label: p.label,
          sublabel: p.sublabel ?? "",
        }))
      );
    } else {
      setSlots([newSlot(), newSlot()]);
    }
  }, [open, initialValue]);

  // Keep an active slot — default to the first empty, else the first slot
  useEffect(() => {
    if (!open) return;
    setActiveId((prev) => {
      if (prev && slots.some((s) => s.id === prev)) return prev;
      const firstEmpty = slots.find((s) => !hasCoords(s));
      return (firstEmpty ?? slots[0])?.id ?? null;
    });
  }, [open, slots]);

  // --- Slot mutations ---

  const setSlotLocation = useCallback(
    (id: string, lat: number, lng: number, label: string, sublabel = "") => {
      setSlots((prev) =>
        prev.map((s) => (s.id === id ? { ...s, lat, lng, label, sublabel } : s))
      );
    },
    []
  );

  /** Set coords immediately, then reverse-geocode to fill the label + sublabel. */
  const setSlotLocationWithReverse = useCallback(
    async (id: string, lat: number, lng: number) => {
      setSlots((prev) =>
        prev.map((s) => (s.id === id ? { ...s, lat, lng, label: "Locating…", sublabel: "" } : s))
      );
      let label: string;
      let sublabel = "";
      try {
        const result = await reverseGeocode(lat, lng);
        label = clampLabel(result.displayName);
        sublabel = clampLabel(result.secondaryName ?? "");
      } catch {
        label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      }
      setSlots((prev) =>
        prev.map((s) =>
          s.id === id && s.label === "Locating…" ? { ...s, label, sublabel } : s
        )
      );
    },
    []
  );

  function updateLabel(id: string, label: string) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, label } : s)));
  }

  function moveSlot(index: number, dir: -1 | 1) {
    const newIdx = index + dir;
    if (newIdx < 0 || newIdx >= slots.length) return;
    setSlots((prev) => {
      const updated = [...prev];
      [updated[index], updated[newIdx]] = [updated[newIdx], updated[index]];
      return updated;
    });
  }

  function removeSlot(id: string) {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  }

  function addWaypoint() {
    if (slots.length >= 10) {
      toast.error("Maximum 10 pins reached.");
      return;
    }
    const slot = newSlot();
    // Insert before the destination (last slot)
    setSlots((prev) => [...prev.slice(0, -1), slot, prev[prev.length - 1]]);
    setActiveId(slot.id);
  }

  // --- Map interactions ---

  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const { lat, lng } = e.lngLat;
      // Fill the active slot, else the first empty slot
      const target =
        slots.find((s) => s.id === activeId) ?? slots.find((s) => !hasCoords(s));
      if (!target) {
        toast.error("Select a pin to place.");
        return;
      }
      setActiveId(target.id);
      void setSlotLocationWithReverse(target.id, lat, lng);
    },
    [slots, activeId, setSlotLocationWithReverse]
  );

  function handleDragEnd(id: string, lngLat: { lng: number; lat: number }) {
    void setSlotLocationWithReverse(id, lngLat.lat, lngLat.lng);
  }

  /** Search-result pick for a slot: set coords + label + sublabel and fly there. */
  function handleSlotPick(id: string, result: GeocodeResult) {
    setSlotLocation(
      id,
      result.lat,
      result.lon,
      clampLabel(result.displayName),
      clampLabel(result.secondaryName ?? "")
    );
    setActiveId(id);
    mapRef.current?.flyTo({
      center: [result.lon, result.lat],
      zoom: 14,
      duration: 800,
    });
  }

  // --- Save ---

  function handleSave() {
    const origin = slots[0];
    const dest = slots[slots.length - 1];
    if (!hasCoords(origin) || !hasCoords(dest)) {
      toast.error("Set both an origin and a destination.");
      return;
    }
    const pins: MapPin[] = slots.filter(hasCoords).map((s) => ({
      lat: s.lat,
      lng: s.lng,
      label: clampLabel(s.label) || `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`,
      sublabel: clampLabel(s.sublabel) || undefined,
    }));

    const result = mapDataSchema.safeParse({ version: 1, pins });
    if (!result.success) {
      toast.error(result.error.issues[0]?.message ?? "Invalid map data");
      return;
    }
    onSave(result.data);
    onOpenChange(false);
  }

  // --- Derived map data ---
  const placedPins: MapPin[] = slots.filter(hasCoords).map((s) => ({
    lat: s.lat,
    lng: s.lng,
    label: s.label,
    sublabel: s.sublabel || undefined,
  }));
  const fitView = placedPins.length >= 2 ? fitPinsToView(placedPins, 560, 420) : undefined;
  const lineData = placedPins.length >= 2 ? lineStringFromPins(placedPins) : null;
  const canSave = hasCoords(slots[0]) && hasCoords(slots[slots.length - 1]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex min-h-0 flex-col gap-0 overflow-hidden p-0 inset-0 h-auto max-h-none w-full max-w-none translate-x-0 translate-y-0 rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[min(80vh,700px)] sm:max-h-[90vh] sm:w-[92vw] sm:max-w-4xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
        showCloseButton={false}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Header */}
          <DialogHeader className="shrink-0 border-b px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
            <DialogTitle className="flex items-center gap-2">
              <MapPinIcon className="h-4 w-4" />
              Add route map
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Search each location, or click the map to place the selected pin.
              Drag a marker to fine-tune.
            </p>
          </DialogHeader>

          {/* Body: one scroll on mobile (map + slots); side-by-side on md+ */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] md:flex-row md:overflow-hidden">
            {/* Map */}
            <div className="h-[38vh] shrink-0 md:h-auto md:min-h-0 md:flex-1">
              <MapView
                mapRef={mapRef}
                className="h-full w-full rounded-none"
                onClick={handleMapClick}
                interactive
                cooperativeGestures
                showNavigationControl
                initialViewState={fitView ?? undefined}
              >
                {lineData && (
                  <Source id="route-line" type="geojson" data={lineData}>
                    <Layer
                      id="route-line-layer"
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

                {slots.map((slot, i) =>
                  hasCoords(slot) ? (
                    <Marker
                      key={slot.id}
                      longitude={slot.lng}
                      latitude={slot.lat}
                      color={roleColor(i, slots.length)}
                      draggable
                      onDragEnd={(e) => handleDragEnd(slot.id, e.lngLat)}
                    />
                  ) : null
                )}
              </MapView>
            </div>

            {/* Sidebar — slot list */}
            <div className="flex min-h-0 flex-col border-t bg-background md:w-80 md:flex-none md:overflow-hidden md:border-t-0 md:border-l">
              <div className="p-2 space-y-2 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain">
                {slots.map((slot, i) => (
                  <SlotRow
                    key={slot.id}
                    slot={slot}
                    index={i}
                    total={slots.length}
                    isActive={slot.id === activeId}
                    canRemove={i !== 0 && i !== slots.length - 1}
                    onSelect={() => setActiveId(slot.id)}
                    onPick={(r) => handleSlotPick(slot.id, r)}
                    onLabelChange={(v) => updateLabel(slot.id, v)}
                    onMove={(dir) => moveSlot(i, dir)}
                    onRemove={() => removeSlot(slot.id)}
                  />
                ))}

                {/* Add waypoint */}
                {slots.length < 10 && (
                  <button
                    onClick={addWaypoint}
                    className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add stop
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Footer — plain div (DialogFooter's negative margins break under p-0 parent) */}
          <div className="flex shrink-0 justify-end gap-2 border-t bg-muted/50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!canSave}>
              Save route
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// SlotRow — single slot card; owns its own location search
// ---------------------------------------------------------------------------

interface SlotRowProps {
  slot: Slot;
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
  const color = roleColor(index, total);
  const placed = hasCoords(slot);

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
            {roleLabel(index, total)}
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
              title="Remove stop"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Location search */}
      <div onClick={(e) => e.stopPropagation()}>
        <LocationSearch
          placeholder={`Search ${roleLabel(index, total).toLowerCase()}…`}
          onPick={onPick}
          onFocus={onSelect}
        />
      </div>

      {/* Placed location: editable label + sublabel + coords */}
      {placed ? (
        <>
          <input
            value={slot.label}
            onChange={(e) => onLabelChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="Place name…"
            maxLength={120}
            className="w-full rounded border bg-background px-2 py-1 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {slot.sublabel && (
            <p className="text-[10px] text-muted-foreground leading-tight px-0.5">
              {slot.sublabel}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground tabular-nums">
            {slot.lat.toFixed(5)}, {slot.lng.toFixed(5)}
          </p>
        </>
      ) : (
        <p className="text-[10px] text-muted-foreground italic">
          Not set — search above or click the map.
        </p>
      )}
    </div>
  );
}

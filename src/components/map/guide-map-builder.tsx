"use client";
/**
 * GuideMapBuilder — dialog for composing a multi-leg, multi-modal route map
 * on a comment. Each leg is an origin→destination pair with a transport mode.
 * Connectors link one leg's destination end to another leg's origin end (the
 * transfer point) and carry their own mode, forming one continuous chain.
 *
 * Same-type connections (origin↔origin / destination↔destination) are
 * prevented by UI construction. Chain integrity is validated on save.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MapPin as MapPinIcon,
  Plus,
  X,
  Trash2,
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
import {
  ENABLED_MODES,
  MODE_META,
  guideMapDataSchema,
  type GuideMapData,
  type GuideLeg,
  type GuideConnector,
  type TransportMode,
} from "@/lib/schemas/guide-map";
import { pinSchema } from "@/lib/schemas/post-map";
import {
  MapView,
  Marker,
  Source,
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
} from "@/components/map";
import { guideMapFit, legSegments, connectorSegments } from "./guide-geometry";
import { LocationSearch } from "./location-search";

// ---------------------------------------------------------------------------
// Internal builder types
// ---------------------------------------------------------------------------

interface BuilderSlot {
  lat: number | null;
  lng: number | null;
  label: string;
  sublabel: string;
}

interface BuilderLeg {
  id: string;
  mode: TransportMode;
  origin: BuilderSlot;
  destination: BuilderSlot;
}

interface BuilderConnector {
  id: string;
  mode: TransportMode;
  /** The leg whose destination end is the departure point. */
  fromLegId: string;
  /** The leg whose origin end is the arrival point. */
  toLegId: string;
}

/** Which leg-end the next map-click / drag should fill. */
interface ActiveEnd {
  legId: string;
  end: "origin" | "destination";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptySlot(): BuilderSlot {
  return { lat: null, lng: null, label: "", sublabel: "" };
}

function newLeg(): BuilderLeg {
  return {
    id: crypto.randomUUID(),
    mode: "jeepney",
    origin: emptySlot(),
    destination: emptySlot(),
  };
}

function slotHasCoords(s: BuilderSlot): s is BuilderSlot & { lat: number; lng: number } {
  return s.lat !== null && s.lng !== null;
}

function clampLabel(s: string): string {
  return s.trim().slice(0, 120);
}

/** Convert a BuilderSlot to a valid pin (throws if no coords). */
function slotToPin(s: BuilderSlot & { lat: number; lng: number }) {
  return {
    lat: s.lat,
    lng: s.lng,
    label: clampLabel(s.label) || `${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}`,
    sublabel: clampLabel(s.sublabel) || undefined,
  };
}

/** Origin = green, destination = red (consistent with commuter map). */
const ORIGIN_COLOR = "#22c55e";
const DEST_COLOR = "#ef4444";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue: GuideMapData | null;
  onSave: (data: GuideMapData) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GuideMapBuilder({ open, onOpenChange, initialValue, onSave }: Props) {
  const [legs, setLegs] = useState<BuilderLeg[]>([newLeg()]);
  const [connectors, setConnectors] = useState<BuilderConnector[]>([]);
  const [activeEnd, setActiveEnd] = useState<ActiveEnd | null>(null);
  const mapRef = useRef<MapRef | null>(null);

  // Seed from initialValue when dialog opens
  useEffect(() => {
    if (!open) return;
    if (initialValue && initialValue.legs.length >= 1) {
      setLegs(
        initialValue.legs.map((l) => ({
          id: l.id,
          mode: l.mode,
          origin: { lat: l.origin.lat, lng: l.origin.lng, label: l.origin.label, sublabel: l.origin.sublabel ?? "" },
          destination: { lat: l.destination.lat, lng: l.destination.lng, label: l.destination.label, sublabel: l.destination.sublabel ?? "" },
        }))
      );
      setConnectors(
        (initialValue.connectors ?? []).map((c) => ({
          id: c.id,
          mode: c.mode,
          fromLegId: c.from.legId,
          toLegId: c.to.legId,
        }))
      );
    } else {
      setLegs([newLeg()]);
      setConnectors([]);
    }
  }, [open, initialValue]);

  // Default active end to the first empty slot
  useEffect(() => {
    if (!open) return;
    setActiveEnd((prev) => {
      if (prev) {
        const leg = legs.find((l) => l.id === prev.legId);
        if (leg) return prev;
      }
      for (const l of legs) {
        if (!slotHasCoords(l.origin)) return { legId: l.id, end: "origin" };
        if (!slotHasCoords(l.destination)) return { legId: l.id, end: "destination" };
      }
      return legs[0] ? { legId: legs[0].id, end: "origin" } : null;
    });
  }, [open, legs]);

  // --- Slot mutations ---

  const setEndLocation = useCallback(
    (legId: string, end: "origin" | "destination", slot: Partial<BuilderSlot>) => {
      setLegs((prev) =>
        prev.map((l) =>
          l.id === legId ? { ...l, [end]: { ...l[end], ...slot } } : l
        )
      );
    },
    []
  );

  const setEndWithReverse = useCallback(
    async (legId: string, end: "origin" | "destination", lat: number, lng: number) => {
      setEndLocation(legId, end, { lat, lng, label: "Locating…", sublabel: "" });
      let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      let sublabel = "";
      try {
        const r = await reverseGeocode(lat, lng);
        label = clampLabel(r.displayName);
        sublabel = clampLabel(r.secondaryName ?? "");
      } catch {
        // keep coordinate fallback
      }
      setLegs((prev) =>
        prev.map((l) =>
          l.id === legId && l[end].label === "Locating…"
            ? { ...l, [end]: { ...l[end], label, sublabel } }
            : l
        )
      );
    },
    [setEndLocation]
  );

  function setLegMode(legId: string, mode: TransportMode) {
    setLegs((prev) => prev.map((l) => (l.id === legId ? { ...l, mode } : l)));
  }

  function addLeg() {
    if (legs.length >= 8) { toast.error("Maximum 8 legs."); return; }
    const leg = newLeg();
    setLegs((prev) => [...prev, leg]);
    setActiveEnd({ legId: leg.id, end: "origin" });
  }

  function removeLeg(legId: string) {
    setLegs((prev) => prev.filter((l) => l.id !== legId));
    setConnectors((prev) =>
      prev.filter((c) => c.fromLegId !== legId && c.toLegId !== legId)
    );
  }

  // --- Map interactions ---

  const handleMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      const { lat, lng } = e.lngLat;
      if (!activeEnd) return;
      void setEndWithReverse(activeEnd.legId, activeEnd.end, lat, lng);
    },
    [activeEnd, setEndWithReverse]
  );

  function handleDragEnd(
    legId: string,
    end: "origin" | "destination",
    lngLat: { lng: number; lat: number }
  ) {
    void setEndWithReverse(legId, end, lngLat.lat, lngLat.lng);
  }

  function handlePick(legId: string, end: "origin" | "destination", r: import("@/lib/geo/types").GeocodeResult) {
    setEndLocation(legId, end, {
      lat: r.lat,
      lng: r.lon,
      label: clampLabel(r.displayName),
      sublabel: clampLabel(r.secondaryName ?? ""),
    });
    setActiveEnd({ legId, end });
    mapRef.current?.flyTo({ center: [r.lon, r.lat], zoom: 14, duration: 800 });
  }

  // --- Connectors ---

  function addConnector(fromLegId: string, toLegId: string, mode: TransportMode) {
    setConnectors((prev) => [
      ...prev,
      { id: crypto.randomUUID(), mode, fromLegId, toLegId },
    ]);
  }

  function updateConnectorMode(id: string, mode: TransportMode) {
    setConnectors((prev) => prev.map((c) => (c.id === id ? { ...c, mode } : c)));
  }

  function removeConnector(id: string) {
    setConnectors((prev) => prev.filter((c) => c.id !== id));
  }

  // --- Save ---

  function handleSave() {
    const legResults = legs.map((l) => {
      const op = pinSchema.safeParse(slotHasCoords(l.origin) ? slotToPin(l.origin as BuilderSlot & { lat: number; lng: number }) : {});
      const dp = pinSchema.safeParse(slotHasCoords(l.destination) ? slotToPin(l.destination as BuilderSlot & { lat: number; lng: number }) : {});
      if (!op.success || !dp.success) return null;
      return { id: l.id, mode: l.mode, origin: op.data, destination: dp.data };
    });

    if (legResults.some((r) => r === null)) {
      toast.error("Every leg must have both an origin and a destination.");
      return;
    }

    const payload = {
      version: 1 as const,
      kind: "guide" as const,
      legs: legResults as NonNullable<typeof legResults[number]>[],
      connectors: connectors.map((c) => ({
        id: c.id,
        mode: c.mode,
        from: { legId: c.fromLegId, end: "destination" as const },
        to: { legId: c.toLegId, end: "origin" as const },
      })),
    };

    const result = guideMapDataSchema.safeParse(payload);
    if (!result.success) {
      toast.error(result.error.issues[0]?.message ?? "Invalid guide map");
      return;
    }
    onSave(result.data);
    onOpenChange(false);
  }

  // --- Map preview data ---

  const validLegs: GuideLeg[] = legs
    .filter((l) => slotHasCoords(l.origin) && slotHasCoords(l.destination))
    .map((l) => ({
      id: l.id,
      mode: l.mode,
      origin: slotToPin(l.origin as BuilderSlot & { lat: number; lng: number }),
      destination: slotToPin(l.destination as BuilderSlot & { lat: number; lng: number }),
    }));

  const validConnectors: GuideConnector[] = connectors
    .filter((c) =>
      validLegs.some((l) => l.id === c.fromLegId) &&
      validLegs.some((l) => l.id === c.toLegId)
    )
    .map((c) => ({
      id: c.id,
      mode: c.mode,
      from: { legId: c.fromLegId, end: "destination" as const },
      to: { legId: c.toLegId, end: "origin" as const },
    }));

  const allLegSegs = validLegs.length > 0 ? legSegments(validLegs) : [];
  const allConnSegs = connectorSegments(validLegs, validConnectors);
  const fitView = validLegs.length > 0 ? guideMapFit(validLegs, 560, 420) : undefined;
  const canSave = legs.every((l) => slotHasCoords(l.origin) && slotHasCoords(l.destination));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex min-h-0 flex-col gap-0 overflow-hidden p-0 inset-0 h-auto max-h-none w-full max-w-none translate-x-0 translate-y-0 rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[min(80vh,720px)] sm:max-h-[90vh] sm:w-[92vw] sm:max-w-4xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
        showCloseButton={false}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Header */}
          <DialogHeader className="shrink-0 border-b px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
            <DialogTitle className="flex items-center gap-2">
              <MapPinIcon className="h-4 w-4" />
              Add guide route
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Add legs (origin → destination + mode). Connect legs via transfer connectors to build the full route.
            </p>
          </DialogHeader>

          {/* Body: one scroll on mobile (map + legs); side-by-side on md+ */}
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
                {/* Leg lines */}
                {allLegSegs.map((seg, i) => (
                  <Source
                    key={`leg-src-${i}`}
                    id={`leg-line-${i}`}
                    type="geojson"
                    data={{
                      type: "Feature",
                      geometry: { type: "LineString", coordinates: seg.coords },
                      properties: {},
                    }}
                  >
                    <Layer
                      id={`leg-line-layer-${i}`}
                      type="line"
                      paint={{ "line-color": seg.color, "line-width": 3, "line-opacity": 0.9 }}
                      layout={{ "line-join": "round", "line-cap": "round" }}
                    />
                  </Source>
                ))}
                {/* Connector lines — dashed */}
                {allConnSegs.map((seg, i) => (
                  <Source
                    key={`conn-src-${i}`}
                    id={`conn-line-${i}`}
                    type="geojson"
                    data={{
                      type: "Feature",
                      geometry: { type: "LineString", coordinates: seg.coords },
                      properties: {},
                    }}
                  >
                    <Layer
                      id={`conn-line-layer-${i}`}
                      type="line"
                      paint={{
                        "line-color": seg.color,
                        "line-width": 2,
                        "line-opacity": 0.75,
                        "line-dasharray": [2, 2],
                      }}
                      layout={{ "line-join": "round", "line-cap": "round" }}
                    />
                  </Source>
                ))}
                {/* Markers */}
                {validLegs.map((l) => (
                  <span key={l.id}>
                    <Marker
                      longitude={l.origin.lng}
                      latitude={l.origin.lat}
                      color={ORIGIN_COLOR}
                      draggable
                      onDragEnd={(e) => handleDragEnd(l.id, "origin", e.lngLat)}
                    />
                    <Marker
                      longitude={l.destination.lng}
                      latitude={l.destination.lat}
                      color={DEST_COLOR}
                      draggable
                      onDragEnd={(e) => handleDragEnd(l.id, "destination", e.lngLat)}
                    />
                  </span>
                ))}
              </MapView>
            </div>

            {/* Sidebar */}
            <div className="flex min-h-0 flex-col border-t bg-background md:w-80 md:flex-none md:overflow-hidden md:border-t-0 md:border-l">
              <div className="space-y-0 p-2 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain">

                {/* Interleaved leg cards + connector slots */}
                {legs.map((leg, i) => (
                  <div key={leg.id}>
                    <LegCard
                      leg={leg}
                      index={i}
                      activeEnd={activeEnd}
                      onActivate={(end) => setActiveEnd({ legId: leg.id, end })}
                      onPick={(end, r) => handlePick(leg.id, end, r)}
                      onLabelChange={(end, v) =>
                        setEndLocation(leg.id, end, { label: v })
                      }
                      onModeChange={(m) => setLegMode(leg.id, m)}
                      onRemove={legs.length > 1 ? () => removeLeg(leg.id) : undefined}
                    />
                    {/* Connector slot between this leg and the next */}
                    {i < legs.length - 1 && (
                      <ConnectorSlot
                        connector={connectors.find(
                          (c) => c.fromLegId === leg.id && c.toLegId === legs[i + 1].id
                        )}
                        onAdd={(mode) => addConnector(leg.id, legs[i + 1].id, mode)}
                        onRemove={(id) => removeConnector(id)}
                        onModeChange={(id, mode) => updateConnectorMode(id, mode)}
                      />
                    )}
                  </div>
                ))}

                {/* Add leg */}
                {legs.length < 8 && (
                  <div className="pt-2">
                    <button
                      onClick={addLeg}
                      className="w-full flex items-center justify-center gap-1.5 rounded-md border border-dashed py-2 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add leg
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 justify-end gap-2 border-t bg-muted/50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={!canSave}>
              Save guide route
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// ConnectorSlot — inline transfer card between two leg cards
// ---------------------------------------------------------------------------

interface ConnectorSlotProps {
  connector: BuilderConnector | undefined;
  onAdd: (mode: TransportMode) => void;
  onRemove: (id: string) => void;
  onModeChange: (id: string, mode: TransportMode) => void;
}

function ConnectorSlot({ connector, onAdd, onRemove, onModeChange }: ConnectorSlotProps) {
  return (
    <div className="flex items-stretch gap-0 py-0.5">
      {/* Dashed vertical track */}
      <div className="flex flex-col items-center w-6 shrink-0 pl-2">
        <div className="flex-1 border-l-2 border-dashed border-muted-foreground/30" />
      </div>

      {/* Transfer card */}
      <div className="flex-1 flex items-center gap-1.5 rounded-md border border-dashed bg-muted/30 px-2 py-1.5 my-0.5 mr-0.5">
        <span className="text-[10px] text-muted-foreground shrink-0">Transfer:</span>
        <div className="flex items-center gap-1 flex-wrap">
          {ENABLED_MODES.map((m) => {
            const active = connector?.mode === m;
            return (
              <button
                key={m}
                onClick={() =>
                  connector ? onModeChange(connector.id, m) : onAdd(m)
                }
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium border transition-colors",
                  active
                    ? "text-white border-transparent"
                    : "bg-background text-muted-foreground hover:text-foreground"
                )}
                style={
                  active
                    ? { backgroundColor: MODE_META[m].color, borderColor: MODE_META[m].color }
                    : {}
                }
              >
                {MODE_META[m].label}
              </button>
            );
          })}
        </div>
        {connector && (
          <button
            onClick={() => onRemove(connector.id)}
            className="ml-auto shrink-0 p-0.5 rounded hover:bg-destructive/20 text-destructive transition-colors"
            title="Remove transfer"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LegCard — one leg's editor (mode selector + origin/dest search rows)
// ---------------------------------------------------------------------------

interface LegCardProps {
  leg: BuilderLeg;
  index: number;
  activeEnd: ActiveEnd | null;
  onActivate: (end: "origin" | "destination") => void;
  onPick: (end: "origin" | "destination", r: import("@/lib/geo/types").GeocodeResult) => void;
  onLabelChange: (end: "origin" | "destination", value: string) => void;
  onModeChange: (mode: TransportMode) => void;
  onRemove?: () => void;
}

function LegCard({
  leg,
  index,
  activeEnd,
  onActivate,
  onPick,
  onLabelChange,
  onModeChange,
  onRemove,
}: LegCardProps) {
  return (
    <div className="rounded-md border bg-card p-2.5 text-xs space-y-2">
      {/* Header: leg label + remove */}
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium text-[10px] uppercase tracking-wide text-muted-foreground">
          Leg {index + 1}
        </span>
        {onRemove && (
          <button
            onClick={onRemove}
            className="p-0.5 rounded hover:bg-destructive/20 text-destructive transition-colors"
            title="Remove leg"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Mode selector */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-muted-foreground text-[10px] shrink-0">Mode:</span>
        {ENABLED_MODES.map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={cn(
              "px-2 py-0.5 rounded text-[10px] font-medium border transition-colors",
              leg.mode === m
                ? "text-white border-transparent"
                : "bg-background text-muted-foreground hover:text-foreground"
            )}
            style={leg.mode === m ? { backgroundColor: MODE_META[m].color, borderColor: MODE_META[m].color } : {}}
          >
            {MODE_META[m].label}
          </button>
        ))}
      </div>

      {/* Origin */}
      <EndRow
        label="Origin"
        color="#22c55e"
        slot={leg.origin}
        isActive={activeEnd?.legId === leg.id && activeEnd.end === "origin"}
        onActivate={() => onActivate("origin")}
        onPick={(r) => onPick("origin", r)}
        onLabelChange={(v) => onLabelChange("origin", v)}
      />

      {/* Destination */}
      <EndRow
        label="Destination"
        color="#ef4444"
        slot={leg.destination}
        isActive={activeEnd?.legId === leg.id && activeEnd.end === "destination"}
        onActivate={() => onActivate("destination")}
        onPick={(r) => onPick("destination", r)}
        onLabelChange={(v) => onLabelChange("destination", v)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// EndRow — one origin or destination slot within a leg card
// ---------------------------------------------------------------------------

interface EndRowProps {
  label: string;
  color: string;
  slot: BuilderSlot;
  isActive: boolean;
  onActivate: () => void;
  onPick: (r: import("@/lib/geo/types").GeocodeResult) => void;
  onLabelChange: (v: string) => void;
}

function EndRow({ label, color, slot, isActive, onActivate, onPick, onLabelChange }: EndRowProps) {
  const placed = slotHasCoords(slot);
  return (
    <div
      onClick={onActivate}
      className={cn(
        "rounded border p-2 space-y-1.5 cursor-pointer transition-shadow",
        isActive ? "ring-2 ring-primary bg-primary/5" : "bg-muted/30 hover:bg-muted/50"
      )}
    >
      {/* Role dot + label */}
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color }}>
          {label}
        </span>
      </div>

      {/* Search */}
      <div onClick={(e) => e.stopPropagation()}>
        <LocationSearch
          placeholder={`Search ${label.toLowerCase()}…`}
          onPick={onPick}
          onFocus={onActivate}
        />
      </div>

      {/* Placed pin info */}
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
            {slot.lat!.toFixed(5)}, {slot.lng!.toFixed(5)}
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

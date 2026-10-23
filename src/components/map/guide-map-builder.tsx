"use client";
/**
 * GuideMapBuilder — dialog for composing a multi-leg, multi-modal post map
 * on a comment. Each leg is an origin→destination pair with a transport mode.
 * Transfers link one leg's destination end to another leg's origin end (the
 * transfer point) and carry their own mode, forming one continuous chain.
 *
 * Same-type connections (origin↔origin / destination↔destination) are
 * prevented by UI construction. Chain integrity is validated on save.
 * Placement, labeling, and the camera come from the shared map-editing core
 * (`useMapEditor`); this file keeps only the legs-and-transfers shape.
 */
import { Fragment, useMemo, useState } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { GeocodeResult } from "@/lib/geo";
import { PIN_COLORS, modeColor } from "@/lib/map/colors";
import { ENABLED_MODES, MODE_META, type TransportMode } from "@/lib/schemas/modes";
import {
  CURRENT_GUIDE_VERSION,
  guideMapDataSchema,
  type GuideMapData,
  type GuideLeg,
  type GuideTransfer,
} from "@/lib/schemas/guide-map";
import { guideChainStatus } from "@/lib/schemas/guide-chain";
import { pinSchema } from "@/lib/schemas/post-map";
import { MapView, Marker, Source, Layer } from "./primitives";
import { legSegments, transferSegments } from "./guide-geometry";
import { BuilderShell } from "./builder-shell";
import { SlotFields } from "./slot-fields";
import { isPlaced, slotToPin, type EditorSlot, type SeedSlot } from "./map-editor-state";
import { useMapEditor, useOpenSession } from "./use-map-editor";

// ---------------------------------------------------------------------------
// Internal builder types
// ---------------------------------------------------------------------------

/** A leg's shape; its two end pins are editor slots keyed by `endKey`. */
interface BuilderLeg {
  id: string;
  mode: TransportMode;
}

interface BuilderTransfer {
  id: string;
  mode: TransportMode;
  /** The leg whose destination end is the departure point. */
  fromLegId: string;
  /** The leg whose origin end is the arrival point. */
  toLegId: string;
}

type LegEnd = "origin" | "destination";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_LEGS = 8;

/** Editor slot key of one end of a leg. */
function endKey(legId: string, end: LegEnd): string {
  return `${legId}:${end}`;
}

function newLeg(): BuilderLeg {
  return { id: crypto.randomUUID(), mode: "jeepney" };
}

function emptyEnds(legId: string): SeedSlot[] {
  return [
    { key: endKey(legId, "origin"), pin: null },
    { key: endKey(legId, "destination"), pin: null },
  ];
}

/** The saved guide's legs, transfers, and pins, or one empty leg. */
function seedGuide(initialValue: GuideMapData | null): {
  legs: BuilderLeg[];
  transfers: BuilderTransfer[];
  slots: SeedSlot[];
} {
  if (!initialValue || initialValue.legs.length < 1) {
    const leg = newLeg();
    return { legs: [leg], transfers: [], slots: emptyEnds(leg.id) };
  }
  return {
    legs: initialValue.legs.map((l) => ({ id: l.id, mode: l.mode })),
    transfers: (initialValue.connectors ?? []).map((c) => ({
      id: c.id,
      mode: c.mode,
      fromLegId: c.from.legId,
      toLegId: c.to.legId,
    })),
    slots: initialValue.legs.flatMap((l) => [
      { key: endKey(l.id, "origin"), pin: l.origin },
      { key: endKey(l.id, "destination"), pin: l.destination },
    ]),
  };
}

function toTransfer(c: BuilderTransfer): GuideTransfer {
  return {
    id: c.id,
    mode: c.mode,
    from: { legId: c.fromLegId, end: "destination" },
    to: { legId: c.toLegId, end: "origin" },
  };
}

type BuiltGuide = { ok: true; data: GuideMapData } | { ok: false; message: string };

/** The guide document Save writes, or the first problem (also the Save hint). */
function buildGuide(
  legs: BuilderLeg[],
  transfers: BuilderTransfer[],
  slotOf: (key: string) => EditorSlot
): BuiltGuide {
  const endPin = (legId: string, end: LegEnd) => {
    const slot = slotOf(endKey(legId, end));
    const parsed = pinSchema.safeParse(isPlaced(slot) ? slotToPin(slot) : {});
    return parsed.success ? parsed.data : null;
  };
  const chainLegs = legs.map((l) => ({
    id: l.id,
    mode: l.mode,
    origin: endPin(l.id, "origin"),
    destination: endPin(l.id, "destination"),
  }));
  const guideTransfers = transfers.map(toTransfer);

  // Same rule the guide schema refines with, so the hint and Save agree.
  const chain = guideChainStatus(chainLegs, guideTransfers);
  if (!chain.ok) return { ok: false, message: chain.message };

  const result = guideMapDataSchema.safeParse({
    version: CURRENT_GUIDE_VERSION,
    kind: "guide" as const,
    legs: chainLegs,
    connectors: guideTransfers,
  });
  if (!result.success) {
    return { ok: false, message: result.error.issues[0]?.message ?? "This guide isn't complete yet." };
  }
  return { ok: true, data: result.data };
}

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

export function GuideMapBuilder(props: Props) {
  // A fresh editor on every open, seeded from the current initialValue.
  const session = useOpenSession(props.open);
  return <GuideMapEditor key={session} {...props} />;
}

function GuideMapEditor({ open, onOpenChange, initialValue, onSave }: Props) {
  const [seed] = useState(() => seedGuide(initialValue));
  const [legs, setLegs] = useState<BuilderLeg[]>(seed.legs);
  const [transfers, setTransfers] = useState<BuilderTransfer[]>(seed.transfers);
  const order = useMemo(
    () => legs.flatMap((l) => [endKey(l.id, "origin"), endKey(l.id, "destination")]),
    [legs]
  );
  const editor = useMapEditor({ initialSlots: seed.slots, order });

  // --- Leg mutations ---

  function setLegMode(legId: string, mode: TransportMode) {
    setLegs((prev) => prev.map((l) => (l.id === legId ? { ...l, mode } : l)));
  }

  function addLeg() {
    if (legs.length >= MAX_LEGS) {
      toast.error(`Maximum ${MAX_LEGS} legs.`);
      return;
    }
    const leg = newLeg();
    setLegs((prev) => [...prev, leg]);
    editor.addSlots([endKey(leg.id, "origin"), endKey(leg.id, "destination")]);
    editor.select(endKey(leg.id, "origin"));
  }

  function removeLeg(legId: string) {
    setLegs((prev) => prev.filter((l) => l.id !== legId));
    setTransfers((prev) =>
      prev.filter((c) => c.fromLegId !== legId && c.toLegId !== legId)
    );
    editor.removeSlots([endKey(legId, "origin"), endKey(legId, "destination")]);
  }

  // --- Transfers ---

  function addTransfer(fromLegId: string, toLegId: string, mode: TransportMode) {
    setTransfers((prev) => [
      ...prev,
      { id: crypto.randomUUID(), mode, fromLegId, toLegId },
    ]);
  }

  function updateTransferMode(id: string, mode: TransportMode) {
    setTransfers((prev) => prev.map((c) => (c.id === id ? { ...c, mode } : c)));
  }

  function removeTransfer(id: string) {
    setTransfers((prev) => prev.filter((c) => c.id !== id));
  }

  // --- Save ---

  const { slot } = editor;
  const built = useMemo(() => buildGuide(legs, transfers, slot), [legs, transfers, slot]);

  function handleSave() {
    if (!built.ok) {
      toast.error(built.message);
      return;
    }
    onSave(built.data);
    onOpenChange(false);
  }

  // --- Map preview data ---

  const preview = useMemo(() => {
    const validLegs: GuideLeg[] = legs.flatMap((l) => {
      const origin = slot(endKey(l.id, "origin"));
      const destination = slot(endKey(l.id, "destination"));
      return isPlaced(origin) && isPlaced(destination)
        ? [{ id: l.id, mode: l.mode, origin: slotToPin(origin), destination: slotToPin(destination) }]
        : [];
    });
    const placedIds = new Set(validLegs.map((l) => l.id));
    const validTransfers = transfers.filter(
      (c) => placedIds.has(c.fromLegId) && placedIds.has(c.toLegId)
    );
    return {
      legs: validLegs,
      legLines: validLegs.flatMap((l) => legSegments([l]).map((seg) => ({ id: l.id, seg }))),
      transferLines: validTransfers.flatMap((c) =>
        transferSegments(validLegs, [toTransfer(c)]).map((seg) => ({ id: c.id, seg }))
      ),
    };
  }, [legs, transfers, slot]);

  return (
    <BuilderShell
      open={open}
      onOpenChange={onOpenChange}
      title="Add guide"
      description="Add legs (origin → destination + mode). Connect legs via transfers to build the full guide."
      saveLabel="Save guide"
      canSave={built.ok}
      hint={built.ok ? null : built.message}
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
          {/* Leg lines */}
          {preview.legLines.map(({ id, seg }) => (
            <Source
              key={`leg-src-${id}`}
              id={`leg-line-${id}`}
              type="geojson"
              data={{
                type: "Feature",
                geometry: { type: "LineString", coordinates: seg.coords },
                properties: {},
              }}
            >
              <Layer
                id={`leg-line-layer-${id}`}
                type="line"
                paint={{ "line-color": seg.color, "line-width": 3, "line-opacity": 0.9 }}
                layout={{ "line-join": "round", "line-cap": "round" }}
              />
            </Source>
          ))}
          {/* Transfer lines — dashed */}
          {preview.transferLines.map(({ id, seg }) => (
            <Source
              key={`transfer-src-${id}`}
              id={`transfer-line-${id}`}
              type="geojson"
              data={{
                type: "Feature",
                geometry: { type: "LineString", coordinates: seg.coords },
                properties: {},
              }}
            >
              <Layer
                id={`transfer-line-layer-${id}`}
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
          {preview.legs.map((l) => (
            <Fragment key={l.id}>
              <Marker
                longitude={l.origin.lng}
                latitude={l.origin.lat}
                color={PIN_COLORS.origin}
                draggable
                onDragEnd={(e) => {
                  editor.placeAt(endKey(l.id, "origin"), e.lngLat.lat, e.lngLat.lng);
                }}
              />
              <Marker
                longitude={l.destination.lng}
                latitude={l.destination.lat}
                color={PIN_COLORS.destination}
                draggable
                onDragEnd={(e) => {
                  editor.placeAt(endKey(l.id, "destination"), e.lngLat.lat, e.lngLat.lng);
                }}
              />
            </Fragment>
          ))}
        </MapView>
      }
      panel={
        <>
          {/* Interleaved leg cards + transfer slots */}
          {legs.map((leg, i) => {
            const next = legs[i + 1];
            return (
              <div key={leg.id}>
                <LegCard
                  leg={leg}
                  index={i}
                  origin={slot(endKey(leg.id, "origin"))}
                  destination={slot(endKey(leg.id, "destination"))}
                  activeEnd={
                    editor.activeKey === endKey(leg.id, "origin")
                      ? "origin"
                      : editor.activeKey === endKey(leg.id, "destination")
                        ? "destination"
                        : null
                  }
                  onActivate={(end) => editor.select(endKey(leg.id, end))}
                  onPick={(end, r) => editor.pick(endKey(leg.id, end), r)}
                  onLabelChange={(end, v) => editor.setLabel(endKey(leg.id, end), v)}
                  onModeChange={(m) => setLegMode(leg.id, m)}
                  onRemove={legs.length > 1 ? () => removeLeg(leg.id) : undefined}
                />
                {/* Transfer slot between this leg and the next */}
                {next && (
                  <TransferSlot
                    transfer={transfers.find(
                      (c) => c.fromLegId === leg.id && c.toLegId === next.id
                    )}
                    onAdd={(mode) => addTransfer(leg.id, next.id, mode)}
                    onRemove={(id) => removeTransfer(id)}
                    onModeChange={(id, mode) => updateTransferMode(id, mode)}
                  />
                )}
              </div>
            );
          })}

          {/* Add leg */}
          {legs.length < MAX_LEGS && (
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
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// TransferSlot — inline transfer card between two leg cards
// ---------------------------------------------------------------------------

interface TransferSlotProps {
  transfer: BuilderTransfer | undefined;
  onAdd: (mode: TransportMode) => void;
  onRemove: (id: string) => void;
  onModeChange: (id: string, mode: TransportMode) => void;
}

function TransferSlot({ transfer, onAdd, onRemove, onModeChange }: TransferSlotProps) {
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
            const active = transfer?.mode === m;
            return (
              <button
                key={m}
                onClick={() =>
                  transfer ? onModeChange(transfer.id, m) : onAdd(m)
                }
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium border transition-colors",
                  active
                    ? "text-white border-transparent"
                    : "bg-background text-muted-foreground hover:text-foreground"
                )}
                style={
                  active
                    ? { backgroundColor: modeColor(m), borderColor: modeColor(m) }
                    : {}
                }
              >
                {MODE_META[m].label}
              </button>
            );
          })}
        </div>
        {transfer && (
          <button
            onClick={() => onRemove(transfer.id)}
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
  origin: EditorSlot;
  destination: EditorSlot;
  /** Which of this leg's ends the next map click fills, if any. */
  activeEnd: LegEnd | null;
  onActivate: (end: LegEnd) => void;
  onPick: (end: LegEnd, r: GeocodeResult) => void;
  onLabelChange: (end: LegEnd, value: string) => void;
  onModeChange: (mode: TransportMode) => void;
  onRemove?: () => void;
}

function LegCard({
  leg,
  index,
  origin,
  destination,
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
            style={leg.mode === m ? { backgroundColor: modeColor(m), borderColor: modeColor(m) } : {}}
          >
            {MODE_META[m].label}
          </button>
        ))}
      </div>

      {/* Origin */}
      <EndRow
        label="Origin"
        color={PIN_COLORS.origin}
        slot={origin}
        isActive={activeEnd === "origin"}
        onActivate={() => onActivate("origin")}
        onPick={(r) => onPick("origin", r)}
        onLabelChange={(v) => onLabelChange("origin", v)}
      />

      {/* Destination */}
      <EndRow
        label="Destination"
        color={PIN_COLORS.destination}
        slot={destination}
        isActive={activeEnd === "destination"}
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
  slot: EditorSlot;
  isActive: boolean;
  onActivate: () => void;
  onPick: (r: GeocodeResult) => void;
  onLabelChange: (v: string) => void;
}

function EndRow({ label, color, slot, isActive, onActivate, onPick, onLabelChange }: EndRowProps) {
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

      <SlotFields
        slot={slot}
        role={label}
        onSelect={onActivate}
        onPick={onPick}
        onLabelChange={onLabelChange}
      />
    </div>
  );
}

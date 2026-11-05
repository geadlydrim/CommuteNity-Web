"use client";
/**
 * GuideMapBuilder — dialog for composing a multi-leg, multi-modal guide on a
 * comment. Each leg is an origin→destination pair with a transport mode.
 * Transfers link one leg's destination end to another leg's origin end (the
 * transfer point) and carry their own mode, forming one continuous chain.
 *
 * Same-type connections (origin↔origin / destination↔destination) are
 * prevented by UI construction. Chain integrity is validated on save.
 * Placement, labeling, and the camera come from the shared map-editing core
 * (`useMapEditor`); this file keeps only the legs-and-transfers shape.
 *
 * Each road or walking leg is routed for a street path by its mode's profile,
 * through the leg's vias if it has any (`useRouting`, state in
 * `routing-state.ts`, what to route in `route-stretches.ts`): a routing leg
 * draws dimmed and dashed, a failed one dashed and straight, a routed one
 * solid, all in its mode's colour. Vehicle legs carry a "Uses expressways"
 * switch, preset to the mode's default and reset when the mode changes. A rail
 * leg (MRT, LRT) is never routed and has no switch: once the rail file has
 * loaded (`useRail`, only when a rail leg exists) its path is the slice of the
 * track between the stations nearest its pins (`rail-legs.ts`), or a straight
 * line with a hint saying why. Save waits until no leg is routing or waiting
 * for the rail file, and fits the document to the size budget (`fitGuide`)
 * before handing it over.
 *
 * Each road or walking leg has a Reshape button (rail legs don't): Reshape
 * mode (`useReshape`, state in `reshape-state.ts`, pieces in
 * `reshape-panel.tsx`) is on one leg at a time, and a map tap then adds a via
 * to that leg instead of placing a pin. The vias live in the Reshape state, not
 * in `BuilderLeg`, and are written to each leg's `vias` on save; a leg that
 * becomes a rail leg drops its vias and leaves Reshape mode, and saves `vias: []`.
 */
import { Fragment, useCallback, useMemo, useState } from "react";
import { Plus, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { GeocodeResult } from "@/lib/geo";
import { PIN_COLORS, RESHAPE_CASING_COLOR, modeColor } from "@/lib/map/colors";
import { fitGuide } from "@/lib/map/fit-document";
import type { LatLng } from "@/lib/map/path";
import { ENABLED_MODES, MODE_META, type TransportMode } from "@/lib/schemas/modes";
import {
  CURRENT_GUIDE_VERSION,
  guideMapDataSchema,
  type GuideMapData,
  type GuideLeg,
  type GuideTransfer,
  type Via,
} from "@/lib/schemas/guide-map";
import { guideChainStatus } from "@/lib/schemas/guide-chain";
import { legOptions } from "@/lib/schemas/leg-options";
import { pinSchema } from "@/lib/schemas/post-map";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MapView, Marker, Source, Layer, type MapLayerMouseEvent } from "./primitives";
import { transferSegments } from "./guide-geometry";
import { BuilderShell } from "./builder-shell";
import { SlotFields } from "./slot-fields";
import { isPlaced, slotToPin, type EditorSlot, type SeedSlot } from "./map-editor-state";
import {
  hasPendingRoutes,
  stretchLine,
  stretchView,
  type SeedStretch,
  type StretchLineCollection,
  type StretchLineFeature,
} from "./routing-state";
import { hasExpresswaysChoice, legStretch, legStretches, withMode } from "./route-stretches";
import { ReshapeBanner, ReshapePanel, StaleViasNotice, ViaMarkers } from "./reshape-panel";
import {
  activeViasOf,
  atViaLimit,
  canUndoVias,
  staleViasNotice,
  viasOf,
  type PinMoveSource,
  type SeedVias,
} from "./reshape-state";
import { useMapEditor, useOpenSession } from "./use-map-editor";
import { isRailMode, railLegOutcomes, type RailLegOutcome } from "./rail-legs";
import { useRail } from "./use-rail";
import { useRouting } from "./use-routing";
import { useReshape, type LegEnds } from "./use-reshape";

// ---------------------------------------------------------------------------
// Internal builder types
// ---------------------------------------------------------------------------

/** A leg's shape; its two end pins are editor slots keyed by `endKey`. */
interface BuilderLeg {
  id: string;
  mode: TransportMode;
  /** Whether the leg's street path may use expressways; the mode's default until the author flips it. */
  expressways: boolean;
}

/** A leg with the vias Reshape mode holds for it. */
type ViaLeg = BuilderLeg & { vias: readonly Via[] };

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

const GUIDE_TOO_LARGE = "This guide is too big to save. Remove some legs and try again.";

const ROUTE_CHIP_CLASS =
  "rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium shadow ring-1 ring-border";

/** Editor slot key of one end of a leg. */
function endKey(legId: string, end: LegEnd): string {
  return `${legId}:${end}`;
}

/** The leg and end an editor slot key names, or `null` for a key that isn't one. */
function legEndOfKey(key: string): { legId: string; end: LegEnd } | null {
  const cut = key.lastIndexOf(":");
  const end = key.slice(cut + 1);
  return cut > 0 && (end === "origin" || end === "destination") ? { legId: key.slice(0, cut), end } : null;
}

function newLeg(): BuilderLeg {
  return { id: crypto.randomUUID(), mode: "jeepney", expressways: legOptions("jeepney").expressways };
}

/** A placed end's position, or `null` while it is empty. */
function placedPoint(slot: EditorSlot): LatLng | null {
  return isPlaced(slot) ? { lat: slot.lat, lng: slot.lng } : null;
}

/** Each leg of a reopened draft with the path it was saved with. */
function seedStretchesFrom(initialValue: GuideMapData | null): SeedStretch[] {
  return (initialValue?.legs ?? []).flatMap((l) => {
    const stretch = legStretch(l, l.origin, l.destination);
    return stretch ? [{ ...stretch, path: l.path }] : [];
  });
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
  /** The saved legs' vias, which Reshape mode takes over. */
  legVias: SeedVias[];
} {
  if (!initialValue || initialValue.legs.length < 1) {
    const leg = newLeg();
    return { legs: [leg], transfers: [], slots: emptyEnds(leg.id), legVias: [] };
  }
  return {
    legs: initialValue.legs.map((l) => ({ id: l.id, mode: l.mode, expressways: l.expressways })),
    legVias: initialValue.legs.map((l) => ({ id: l.id, vias: l.vias })),
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

/** The guide document Save writes (each leg with its routed path, or `null`), or the first problem (also the Save hint). */
function buildGuide(
  legs: ViaLeg[],
  transfers: BuilderTransfer[],
  slotOf: (key: string) => EditorSlot,
  pathOf: (legId: string) => string | null
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
    // A rail leg follows a fixed track: it never keeps vias from an earlier mode.
    vias: isRailMode(l.mode) ? [] : [...l.vias],
    expressways: l.expressways,
    path: pathOf(l.id),
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
  /** The draft's stored leg paths; its `null` legs get routed again. */
  const [seedStretches] = useState(() => seedStretchesFrom(initialValue));
  const [legs, setLegs] = useState<BuilderLeg[]>(seed.legs);
  const [transfers, setTransfers] = useState<BuilderTransfer[]>(seed.transfers);
  const order = useMemo(
    () => legs.flatMap((l) => [endKey(l.id, "origin"), endKey(l.id, "destination")]),
    [legs]
  );
  const editor = useMapEditor({ initialSlots: seed.slots, order });

  // --- Leg mutations ---

  function setLegMode(legId: string, mode: TransportMode) {
    // Switching mode resets the expressways choice to the new mode's default.
    setLegs((prev) => prev.map((l) => (l.id === legId ? withMode(l, mode) : l)));
  }

  function setLegExpressways(legId: string, expressways: boolean) {
    setLegs((prev) => prev.map((l) => (l.id === legId ? { ...l, expressways } : l)));
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

  // --- Editor pins ---

  const { slot } = editor;
  /** A leg's pins as placed points. */
  const endsOf = useCallback(
    (legId: string): LegEnds => ({
      origin: placedPoint(slot(endKey(legId, "origin"))),
      destination: placedPoint(slot(endKey(legId, "destination"))),
    }),
    [slot]
  );

  // --- Reshape ---

  const reshape = useReshape(legs, seed.legVias, endsOf);
  const { vias: viasByLeg, active: activeLegId } = reshape.state;
  /** Each leg with the vias Reshape mode holds for it. */
  const viaLegs = useMemo<ViaLeg[]>(() => legs.map((l) => ({ ...l, vias: viasByLeg[l.id] ?? [] })), [legs, viasByLeg]);
  const activeIndex = legs.findIndex((l) => l.id === activeLegId);
  const activeLeg = legs[activeIndex];

  /** One of a leg's pins is about to move; Reshape keeps its vias and decides whether they are now stale. */
  function notePinMove(legId: string, end: LegEnd, to: LatLng, source: PinMoveSource) {
    reshape.pinMoved(legId, placedPoint(slot(endKey(legId, end))), to, source);
  }

  function dragPin(legId: string, end: LegEnd, lat: number, lng: number) {
    notePinMove(legId, end, { lat, lng }, "drag");
    editor.placeAt(endKey(legId, end), lat, lng);
  }

  function pickPin(legId: string, end: LegEnd, result: GeocodeResult) {
    notePinMove(legId, end, { lat: result.lat, lng: result.lon }, "search");
    editor.pick(endKey(legId, end), result);
  }

  /** A tap adds a via while a leg is reshaped, never a pin; otherwise it fills the active pin. */
  function handleMapClick(e: MapLayerMouseEvent) {
    if (activeLegId !== null) {
      reshape.tap({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      return;
    }
    const target = editor.activeKey === null ? null : legEndOfKey(editor.activeKey);
    if (target) notePinMove(target.legId, target.end, { lat: e.lngLat.lat, lng: e.lngLat.lng }, "drag");
    editor.onMapClick(e);
  }

  // --- Routing ---

  const stretches = useMemo(() => legStretches(viaLegs, endsOf), [viaLegs, endsOf]);
  const { state: routing, hold: holdRoutes, release: releaseRoutes } = useRouting(stretches, seedStretches, open);
  const views = stretches.map((stretch) => ({ id: stretch.id, ...stretchView(routing, stretch) }));
  const routingCount = views.filter((v) => v.phase === "routing").length;
  /** Leg numbers (1-based, as the cards show them) whose routing failed. */
  const failedLegs = legs.flatMap((l, i) => (views.some((v) => v.id === l.id && v.phase === "failed") ? [i + 1] : []));

  // Rail legs follow the rail file instead of a router: sliced here, synchronously, once it has loaded.
  const railLoad = useRail(legs.some((l) => isRailMode(l.mode)));
  const railLoading = railLoad.status === "loading";
  const railOutcomes = useMemo(
    () =>
      railLoad.status === "ready" || railLoad.status === "failed"
        ? railLegOutcomes(railLoad.status === "ready" ? railLoad.rail : null, legs, (legId) => ({
            origin: placedPoint(slot(endKey(legId, "origin"))),
            destination: placedPoint(slot(endKey(legId, "destination"))),
          }))
        : new Map<string, RailLegOutcome>(),
    [railLoad, legs, slot]
  );
  /** Why each rail leg without a slice stays straight, by leg id. */
  const railHints = useMemo(
    () => new Map([...railOutcomes].flatMap(([id, outcome]) => (outcome.ok ? [] : [[id, outcome.hint] as const]))),
    [railOutcomes]
  );
  const pending = hasPendingRoutes(routing, stretches) || railLoading;

  // --- Save ---

  const built = useMemo(() => {
    const pathOf = new Map(stretches.map((s) => [s.id, stretchView(routing, s).path]));
    for (const [id, outcome] of railOutcomes) pathOf.set(id, outcome.ok ? outcome.path : null);
    return buildGuide(viaLegs, transfers, slot, (legId) => pathOf.get(legId) ?? null);
  }, [viaLegs, transfers, slot, stretches, routing, railOutcomes]);
  const canSave = built.ok && !pending;
  const saveHint = !built.ok ? built.message : pending ? "Waiting for routes…" : null;

  function handleSave() {
    if (!built.ok) {
      toast.error(built.message);
      return;
    }
    if (pending) return;
    const fitted = fitGuide(built.data);
    if (!fitted.ok) {
      toast.error(GUIDE_TOO_LARGE);
      return;
    }
    onSave(fitted.value);
    onOpenChange(false);
  }

  // --- Map preview data ---

  const preview = useMemo(() => {
    const placedLegs = viaLegs.flatMap((l) => {
      const origin = slot(endKey(l.id, "origin"));
      const destination = slot(endKey(l.id, "destination"));
      return isPlaced(origin) && isPlaced(destination)
        ? [
            {
              id: l.id,
              mode: l.mode,
              origin: slotToPin(origin),
              destination: slotToPin(destination),
              vias: [...l.vias],
              expressways: l.expressways,
              path: null,
            } satisfies GuideLeg,
          ]
        : [];
    });
    const stretchById = new Map(stretches.map((s) => [s.id, s]));
    const legLines: StretchLineCollection = {
      type: "FeatureCollection",
      features: placedLegs.map((l): StretchLineFeature => {
        const stretch = stretchById.get(l.id);
        if (stretch) return stretchLine(routing, stretch);
        // A rail leg follows its slice; one without a slice (or still loading) is a straight line.
        const rail = railOutcomes.get(l.id);
        const points = rail?.ok ? rail.points : [l.origin, l.destination];
        return {
          type: "Feature",
          geometry: { type: "LineString", coordinates: points.map((p): [number, number] => [p.lng, p.lat]) },
          properties: { id: l.id, phase: rail?.ok ? "ok" : railLoading && isRailMode(l.mode) ? "routing" : "idle" },
        };
      }),
    };
    const colorById = new Map(placedLegs.map((l) => [l.id, modeColor(l.mode)]));
    const placedIds = new Set(placedLegs.map((l) => l.id));
    const validTransfers = transfers.filter(
      (c) => placedIds.has(c.fromLegId) && placedIds.has(c.toLegId)
    );
    return {
      legs: placedLegs,
      legLines: {
        ...legLines,
        features: legLines.features.map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            color: colorById.get(f.properties.id) ?? "",
            active: f.properties.id === activeLegId,
          },
        })),
      },
      transferLines: validTransfers.flatMap((c) =>
        transferSegments(placedLegs, [toTransfer(c)]).map((seg) => ({ id: c.id, seg }))
      ),
    };
  }, [viaLegs, transfers, slot, stretches, routing, railOutcomes, railLoading, activeLegId]);

  return (
    <BuilderShell
      open={open}
      onOpenChange={onOpenChange}
      title="Add guide"
      description="Add legs (origin → destination + mode). Connect legs via transfers to build the full guide."
      saveLabel="Save guide"
      canSave={canSave}
      hint={saveHint}
      onSave={handleSave}
      map={
        <div className="relative h-full w-full">
          <MapView
            mapRef={editor.mapRef}
            className="h-full w-full rounded-none"
            onClick={handleMapClick}
            onLoad={editor.onMapLoad}
            interactive
            cooperativeGestures
            restrictToPhilippines
            showNavigationControl
            initialViewState={editor.initialViewState}
          >
            {/* Leg lines: each in its mode colour; routed or straight (idle) solid, routing dimmed and dashed, failed dashed */}
            <Source id="guide-leg-lines" type="geojson" data={preview.legLines}>
              {/* A halo under the leg being reshaped (not while it routes or failed: those draw dashed) */}
              <Layer
                id="guide-leg-lines-casing-layer"
                type="line"
                filter={[
                  "all",
                  ["==", ["get", "active"], true],
                  ["any", ["==", ["get", "phase"], "ok"], ["==", ["get", "phase"], "idle"]],
                ]}
                paint={{ "line-color": RESHAPE_CASING_COLOR, "line-width": 8, "line-opacity": 0.9 }}
                layout={{ "line-join": "round", "line-cap": "round" }}
              />
              <Layer
                id="guide-leg-lines-layer"
                type="line"
                filter={["any", ["==", ["get", "phase"], "ok"], ["==", ["get", "phase"], "idle"]]}
                paint={{
                  "line-color": ["get", "color"],
                  "line-width": ["case", ["get", "active"], 5, 3],
                  "line-opacity": 0.9,
                }}
                layout={{ "line-join": "round", "line-cap": "round" }}
              />
              <Layer
                id="guide-leg-lines-routing-layer"
                type="line"
                filter={["==", ["get", "phase"], "routing"]}
                paint={{
                  "line-color": ["get", "color"],
                  "line-width": ["case", ["get", "active"], 5, 3],
                  "line-opacity": 0.35,
                  "line-dasharray": [2, 2],
                }}
                layout={{ "line-join": "round", "line-cap": "butt" }}
              />
              <Layer
                id="guide-leg-lines-failed-layer"
                type="line"
                filter={["==", ["get", "phase"], "failed"]}
                paint={{
                  "line-color": ["get", "color"],
                  "line-width": ["case", ["get", "active"], 5, 3],
                  "line-opacity": 0.9,
                  "line-dasharray": [2, 2],
                }}
                layout={{ "line-join": "round", "line-cap": "butt" }}
              />
            </Source>
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
                  onDragStart={() => holdRoutes([l.id])}
                  onDragEnd={(e) => {
                    // The pin moves only now, on release, so nothing routes during the drag.
                    dragPin(l.id, "origin", e.lngLat.lat, e.lngLat.lng);
                    releaseRoutes([l.id]);
                  }}
                />
                <Marker
                  longitude={l.destination.lng}
                  latitude={l.destination.lat}
                  color={PIN_COLORS.destination}
                  draggable
                  onDragStart={() => holdRoutes([l.id])}
                  onDragEnd={(e) => {
                    dragPin(l.id, "destination", e.lngLat.lat, e.lngLat.lng);
                    releaseRoutes([l.id]);
                  }}
                />
              </Fragment>
            ))}
            {/* The reshaped leg's vias: numbered, draggable; the leg routes through them on release */}
            {activeLeg && (
              <ViaMarkers
                vias={activeViasOf(reshape.state)}
                color={modeColor(activeLeg.mode)}
                onDragStart={() => holdRoutes([activeLeg.id])}
                onDragEnd={(index, point) => {
                  reshape.moveVia(activeLeg.id, index, point);
                  releaseRoutes([activeLeg.id]);
                }}
              />
            )}
          </MapView>

          {(activeLeg || routingCount > 0 || failedLegs.length > 0) && (
            <div className="pointer-events-none absolute left-2 right-12 top-2 z-10 flex flex-col items-start gap-1">
              {activeLeg && <ReshapeBanner legNumber={activeIndex + 1} onDone={reshape.exit} />}
              {routingCount > 0 && (
                <span role="status" className={ROUTE_CHIP_CLASS}>
                  Routing…
                </span>
              )}
              {failedLegs.map((n) => (
                <span key={n} role="status" className={cn(ROUTE_CHIP_CLASS, "text-destructive")}>
                  Couldn&apos;t reshape Leg {n} — showing a straight line
                </span>
              ))}
            </div>
          )}
        </div>
      }
      panel={
        <>
          {/* Interleaved leg cards + transfer slots */}
          {legs.map((leg, i) => {
            const next = legs[i + 1];
            const ends = endsOf(leg.id);
            const reshaping = activeLegId === leg.id;
            const staleVias = staleViasNotice(reshape.state, leg.id);
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
                  onPick={(end, r) => pickPin(leg.id, end, r)}
                  onLabelChange={(end, v) => editor.setLabel(endKey(leg.id, end), v)}
                  onModeChange={(m) => setLegMode(leg.id, m)}
                  onExpresswaysChange={(v) => setLegExpressways(leg.id, v)}
                  railHint={railHints.get(leg.id) ?? null}
                  onRemove={legs.length > 1 ? () => removeLeg(leg.id) : undefined}
                  reshape={
                    legOptions(leg.mode).profile === "rail"
                      ? null
                      : {
                          viaCount: viasOf(reshape.state, leg.id).length,
                          ready: ends.origin !== null && ends.destination !== null,
                          active: reshaping,
                          onEnter: () => reshape.enter(leg.id, leg.mode),
                        }
                  }
                />
                {staleVias && (
                  <StaleViasNotice viaCount={staleVias.viaCount} onClear={() => reshape.clearVias(leg.id)} />
                )}
                {reshaping && (
                  <ReshapePanel
                    legNumber={i + 1}
                    color={modeColor(leg.mode)}
                    vias={viasOf(reshape.state, leg.id)}
                    atLimit={atViaLimit(reshape.state, leg.id)}
                    canUndo={canUndoVias(reshape.state, leg.id)}
                    onRemove={(index) => reshape.removeVia(leg.id, index)}
                    onUndo={() => reshape.undo(leg.id)}
                    onClearAll={() => reshape.clearVias(leg.id)}
                    onDone={reshape.exit}
                  />
                )}
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

/** The Reshape button of a leg card: absent for a rail leg. */
interface ReshapeControl {
  viaCount: number;
  /** Both pins are placed, so a tap has a path to land on. */
  ready: boolean;
  /** This leg is the one being reshaped. */
  active: boolean;
  onEnter: () => void;
}

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
  onExpresswaysChange: (expressways: boolean) => void;
  /** Why this rail leg stays a straight line, if it does. */
  railHint: string | null;
  onRemove?: () => void;
  reshape: ReshapeControl | null;
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
  onExpresswaysChange,
  railHint,
  onRemove,
  reshape,
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

      {/* Expressways: vehicle legs on the road only */}
      {hasExpresswaysChoice(leg.mode) && (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`expressways-${leg.id}`} className="text-[10px] font-medium text-muted-foreground">
            Uses expressways
          </Label>
          <Switch
            id={`expressways-${leg.id}`}
            size="sm"
            checked={leg.expressways}
            onCheckedChange={onExpresswaysChange}
          />
        </div>
      )}

      {/* Rail legs that can't follow a line: why the straight line stays */}
      {railHint && (
        <p role="status" className="text-[10px] text-muted-foreground">
          {railHint}
        </p>
      )}

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

      {/* Reshape: road and walking legs only */}
      {reshape && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-medium text-muted-foreground">
            {reshape.viaCount} {reshape.viaCount === 1 ? "via" : "vias"}
          </span>
          <button
            onClick={reshape.onEnter}
            disabled={reshape.active || !reshape.ready}
            title={reshape.ready ? undefined : "Place both pins to reshape this leg"}
            className="inline-flex min-h-7 items-center justify-center rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
          >
            {reshape.active ? "Reshaping" : "Reshape"}
          </button>
        </div>
      )}
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

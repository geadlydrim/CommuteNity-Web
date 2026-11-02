/**
 * PROTOTYPE — throwaway. Answers "Reshaping a guide leg" (GitHub issue #4).
 * Three variants of reshaping a guide leg's street path by adding vias,
 * switchable with `?variant=A|B|C` on any page that opens the guide builder.
 * Routing is FAKE: a leg's path is straight segments through
 * origin → vias → destination, returned after a simulated delay.
 *
 * This file is the contract shared by the scaffold (state.ts, path-layers.tsx,
 * switcher.tsx, the hook-up in guide-map-builder.tsx) and the variants
 * (variant-a.tsx, variant-b.tsx, variant-c.tsx).
 */
import type { ReactNode, RefObject } from "react";
import type { MapLayerMouseEvent, MapRef } from "../primitives";

export type LngLat = { lat: number; lng: number };

/** A placed guide leg, as the builder's preview already computes it. */
export type ProtoLeg = {
  id: string;
  /** 1-based, for labels like "Leg 2". */
  index: number;
  color: string;
  origin: LngLat;
  destination: LngLat;
};

/** An unnamed point a leg's street path is forced through (GLOSSARY: Via). */
export type Via = LngLat & { id: string };

export const MAX_VIAS_PER_LEG = 10;

export type RouteStatus = "routing" | "ok" | "failed";

/** One leg's current path from the (fake) router. */
export type LegRoute = {
  status: RouteStatus;
  /** [lng, lat] pairs. While routing, the previous path; on failure, the straight line origin → destination. */
  coords: [number, number][];
};

/** Vias per leg with undo. Implemented by `useViaState` in state.ts. */
export type ViaState = {
  vias: Record<string, Via[]>;
  /** Insert at `index` within the leg's via list (0 = right after the origin). No-op past MAX_VIAS_PER_LEG (returns false). */
  addVia: (legId: string, index: number, point: LngLat) => boolean;
  moveVia: (legId: string, viaId: string, point: LngLat) => void;
  removeVia: (legId: string, viaId: string) => void;
  undo: () => void;
  canUndo: boolean;
};

/**
 * Index to insert a new via at so it lands in the segment of the leg's
 * current point sequence (origin, vias…, destination) nearest to `point`.
 * Implemented in state.ts.
 */
export type NearestInsertIndex = (leg: ProtoLeg, vias: Via[], point: LngLat) => number;

/** What the host passes every variant. */
export type ReshapeVariantProps = {
  legs: ProtoLeg[];
  mapRef: RefObject<MapRef | null>;
  viaState: ViaState;
  routes: Record<string, LegRoute>;
  /** MapLibre layer id of leg `legId`'s path line, rendered by <PathLayers> (for hit-testing drags). */
  pathLayerId: (legId: string) => string;
  /** False when another variant is selected: all three hooks run every render, so inactive ones must not attach map listeners. */
  active: boolean;
};

/** What every variant hook returns; the host places each piece. */
export type ReshapeVariant = {
  /** Rendered inside <MapView> after <PathLayers> (handles, via markers, overlays). */
  mapChildren: ReactNode;
  /** Rendered at the end of the builder's side panel. */
  panel: ReactNode;
  /** Called first on every map click; return true to stop the builder placing a pin. */
  onMapClick?: (e: MapLayerMouseEvent) => boolean;
};

export type VariantHook = (props: ReshapeVariantProps) => ReshapeVariant;

export type VariantKey = "A" | "B" | "C";

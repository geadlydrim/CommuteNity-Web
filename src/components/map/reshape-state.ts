/**
 * Pure state for Reshape mode on a guide's legs: which leg is being reshaped,
 * each leg's vias with an undo stack, and the "old route" notice. No React and
 * no "use client", so Node tests import it directly; the guide builder drives
 * it and hands `legPoints` to the route scheduler.
 *
 * - One road or walking leg is reshaped at a time. Rail legs (and transfers,
 *   which are not legs) can't be: `legOptions(mode).profile === "rail"`.
 * - A map tap in Reshape mode inserts a via into the nearest segment of the
 *   leg's point sequence (origin, ...vias, destination); the builder never
 *   places a pin for it. At `MAX_VIAS_PER_LEG` a tap is refused (state
 *   unchanged); `atViaLimit` tells the panel to say so.
 * - Undo covers via changes only (add, move, remove, clear), per leg. Pin moves
 *   never reach the stack; the state doesn't hold the pins, only `pinMoved`
 *   notifications.
 * - A pin move keeps the vias in order. A search pick, or a drag of more than
 *   1 km, on a leg that has vias raises the notice ("This leg still goes
 *   through N vias placed for the old route"). It clears with the vias, and
 *   when Reshape ends or moves to another leg. Undo restores vias, not the
 *   notice.
 */
import { distanceToSegmentMeters, haversineMeters, type LatLng } from "@/lib/map/path";
import { legOptions } from "@/lib/schemas/leg-options";
import { MAX_VIAS_PER_LEG, type Via } from "@/lib/schemas/guide-map";
import type { TransportMode } from "@/lib/schemas/modes";

/** A drag of more than this, between a pin's old and new position, is a "big move". */
export const BIG_MOVE_METRES = 1000;

/** Undo steps kept per leg. */
export const MAX_UNDO_STEPS = 50;

const NO_VIAS: readonly Via[] = [];

export interface ReshapeState {
  /** The leg being reshaped, or `null` outside Reshape mode. */
  active: string | null;
  /** Each leg's vias, in order. A leg with none may have no entry. */
  vias: Readonly<Record<string, readonly Via[]>>;
  /** Earlier via lists per leg, oldest first; `undo` pops the last. */
  history: Readonly<Record<string, readonly (readonly Via[])[]>>;
  /** Legs showing the "old route" notice. */
  stale: readonly string[];
}

/** A reopened draft's vias for one leg. */
export interface SeedVias {
  id: string;
  vias: readonly Via[];
}

/** What `sync` needs of the guide's legs. */
export interface ReshapeLegRef {
  id: string;
  mode: TransportMode;
}

/** Where a pin move came from: a drag on the map, or a pick from the search box. */
export type PinMoveSource = "drag" | "search";

export type ReshapeAction =
  /** The Reshape button of a leg. Does nothing for a rail leg. */
  | { type: "enter"; legId: string; mode: TransportMode }
  /** Done. */
  | { type: "exit" }
  /** A map tap while a leg is reshaped; `origin` and `destination` are that leg's pins. */
  | { type: "tap"; origin: LatLng; destination: LatLng; point: LatLng }
  /** A via's drag ended; `index` is its position in the leg's list. */
  | { type: "moveVia"; legId: string; index: number; point: LatLng }
  /** The × beside a via. */
  | { type: "removeVia"; legId: string; index: number }
  /** Clear all, and Clear vias on the notice. */
  | { type: "clearVias"; legId: string }
  | { type: "undo"; legId: string }
  /** One of a leg's pins moved. `from` is `null` when it wasn't placed before. */
  | { type: "pinMoved"; legId: string; from: LatLng | null; to: LatLng; source: PinMoveSource }
  /** The guide's legs changed: forget legs that are gone or became rail legs. */
  | { type: "sync"; legs: readonly ReshapeLegRef[] };

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * The index in a leg's via list that a new via at `tap` is inserted at: the
 * segment of `points` (origin, ...vias, destination) nearest the tap, by
 * `distanceToSegmentMeters`. Segment `i` runs from `points[i]` to
 * `points[i + 1]`, so a tap beside it inserts at via index `i`. Ties go to the
 * earlier segment.
 */
export function nearestInsertIndex(points: readonly LatLng[], tap: LatLng): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i + 1 < points.length; i += 1) {
    const distance = distanceToSegmentMeters(tap, points[i]!, points[i + 1]!);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/** The point sequence a leg is routed through: origin, vias in order, destination. */
export function legPoints(origin: LatLng, vias: readonly LatLng[], destination: LatLng): LatLng[] {
  return [origin, ...vias, destination];
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** The state of a builder session; a reopened draft passes its legs' stored vias. */
export function createReshapeState(seed: readonly SeedVias[] = []): ReshapeState {
  const vias: Record<string, readonly Via[]> = {};
  for (const { id, vias: list } of seed) if (list.length > 0) vias[id] = list.map(({ lat, lng }) => ({ lat, lng }));
  return { active: null, vias, history: {}, stale: [] };
}

/** `state` with `legId`'s via list replaced; `record` pushes the old list onto the leg's undo stack. */
function setVias(state: ReshapeState, legId: string, next: readonly Via[], record: boolean): ReshapeState {
  const history = record
    ? { ...state.history, [legId]: [...(state.history[legId] ?? []), viasOf(state, legId)].slice(-MAX_UNDO_STEPS) }
    : state.history;
  return {
    ...state,
    vias: { ...state.vias, [legId]: next },
    history,
    // A leg with no vias has nothing stale.
    stale: next.length === 0 ? state.stale.filter((id) => id !== legId) : state.stale,
  };
}

function leaveActive(state: ReshapeState): ReshapeState {
  return { ...state, active: null, stale: state.stale.filter((id) => id !== state.active) };
}

export function reshapeReducer(state: ReshapeState, action: ReshapeAction): ReshapeState {
  switch (action.type) {
    case "enter": {
      if (legOptions(action.mode).profile === "rail" || state.active === action.legId) return state;
      return { ...leaveActive(state), active: action.legId };
    }

    case "exit":
      return state.active === null ? state : leaveActive(state);

    case "tap": {
      if (state.active === null || atViaLimit(state, state.active)) return state;
      const current = viasOf(state, state.active);
      const index = nearestInsertIndex(legPoints(action.origin, current, action.destination), action.point);
      const via: Via = { lat: action.point.lat, lng: action.point.lng };
      return setVias(state, state.active, [...current.slice(0, index), via, ...current.slice(index)], true);
    }

    case "moveVia": {
      const current = viasOf(state, action.legId);
      const existing = current[action.index];
      if (!existing || (existing.lat === action.point.lat && existing.lng === action.point.lng)) return state;
      const moved: Via = { lat: action.point.lat, lng: action.point.lng };
      return setVias(state, action.legId, current.map((via, i) => (i === action.index ? moved : via)), true);
    }

    case "removeVia": {
      const current = viasOf(state, action.legId);
      if (!current[action.index]) return state;
      return setVias(state, action.legId, current.filter((_, i) => i !== action.index), true);
    }

    case "clearVias":
      return viasOf(state, action.legId).length === 0 ? state : setVias(state, action.legId, [], true);

    case "undo": {
      const stack = state.history[action.legId] ?? [];
      const previous = stack[stack.length - 1];
      if (!previous) return state;
      return { ...setVias(state, action.legId, previous, false), history: { ...state.history, [action.legId]: stack.slice(0, -1) } };
    }

    case "pinMoved": {
      const bigMove =
        action.source === "search" || (action.from !== null && haversineMeters(action.from, action.to) > BIG_MOVE_METRES);
      if (!bigMove || viasOf(state, action.legId).length === 0 || state.stale.includes(action.legId)) return state;
      return { ...state, stale: [...state.stale, action.legId] };
    }

    case "sync": {
      const keep = new Set(action.legs.filter((leg) => legOptions(leg.mode).profile !== "rail").map((leg) => leg.id));
      const forgotten = (record: Readonly<Record<string, unknown>>) => Object.keys(record).filter((id) => !keep.has(id));
      const dropVias = forgotten(state.vias);
      const dropHistory = forgotten(state.history);
      const dropStale = state.stale.filter((id) => !keep.has(id));
      const dropActive = state.active !== null && !keep.has(state.active);
      if (dropVias.length + dropHistory.length + dropStale.length === 0 && !dropActive) return state;
      return {
        active: dropActive ? null : state.active,
        vias: Object.fromEntries(Object.entries(state.vias).filter(([id]) => keep.has(id))),
        history: Object.fromEntries(Object.entries(state.history).filter(([id]) => keep.has(id))),
        stale: state.stale.filter((id) => keep.has(id)),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Reading the state
// ---------------------------------------------------------------------------

/** A leg's vias in order. */
export function viasOf(state: ReshapeState, legId: string): readonly Via[] {
  return state.vias[legId] ?? NO_VIAS;
}

/** The vias of the leg being reshaped (none outside Reshape mode). */
export function activeViasOf(state: ReshapeState): readonly Via[] {
  return state.active === null ? NO_VIAS : viasOf(state, state.active);
}

/** A leg's origin, vias, destination: what to route and what its path is forced through. */
export function viaPointsOf(state: ReshapeState, legId: string, origin: LatLng, destination: LatLng): LatLng[] {
  return legPoints(origin, viasOf(state, legId), destination);
}

/** Adding a via is refused: the leg has `MAX_VIAS_PER_LEG`. */
export function atViaLimit(state: ReshapeState, legId: string): boolean {
  return viasOf(state, legId).length >= MAX_VIAS_PER_LEG;
}

export function canUndoVias(state: ReshapeState, legId: string): boolean {
  return (state.history[legId]?.length ?? 0) > 0;
}

/** The notice for a leg whose pin moved far while it has vias, or `null`. */
export function staleViasNotice(state: ReshapeState, legId: string): { viaCount: number } | null {
  const viaCount = viasOf(state, legId).length;
  return viaCount > 0 && state.stale.includes(legId) ? { viaCount } : null;
}

export function staleViasMessage(viaCount: number): string {
  return `This leg still goes through ${viaCount} ${viaCount === 1 ? "via" : "vias"} placed for the old route`;
}

/**
 * Pure routing state for a post map's consecutive pin pairs: which pairs are
 * routing, routed, failed, or left straight, and the latest path of each. No
 * React and no "use client", so Node tests import it directly;
 * `use-pair-routing.ts` runs the requests this state asks for.
 *
 * A pair is identified by its two slot keys and remembers the coordinates it
 * was routed for. `sync` compares the builder's current pairs with those
 * coordinates: a pair whose two pins haven't moved keeps its entry (and path),
 * anything else starts a fresh request. Every request carries the entry's
 * token; a result for a superseded token is ignored, so a slow old answer
 * can't overwrite a newer one.
 *
 * Once the endpoint says routing is `unavailable`, no more requests are asked
 * for and every unrouted pair stays a straight line.
 */
import { decodePath, type LatLng } from "@/lib/map/path";
import { POST_MAP_PAIR, legOptions } from "@/lib/schemas/leg-options";
import type { RouteRequest } from "@/lib/schemas/route";

/** `idle`: straight line, nothing requested (routing unavailable). */
export type PairPhase = "idle" | "routing" | "ok" | "failed";

/** One consecutive pair of placed pins. */
export interface PairInput {
  id: string;
  from: LatLng;
  to: LatLng;
}

/** A pair of a reopened draft, with the path it was saved with. */
export interface SeedPair extends PairInput {
  path: string | null;
}

interface PairEntry {
  from: LatLng;
  to: LatLng;
  phase: PairPhase;
  /** The street path while `ok`, else `null`. */
  path: string | null;
  /** Token of the request this entry waits for (0 = none was made). */
  token: number;
}

export interface PairRoutingState {
  pairs: ReadonlyMap<string, PairEntry>;
  nextToken: number;
  /** The endpoint reported no router: stop requesting for the rest of the session. */
  unavailable: boolean;
}

/** What a finished request tells the state. */
export type PairOutcome = { status: "ok"; path: string } | { status: "failed" } | { status: "unavailable" };

export type PairRoutingAction =
  /** The builder's pairs changed (pin placed, moved, removed, or reordered). */
  | { type: "sync"; pairs: readonly PairInput[] }
  | { type: "result"; id: string; token: number; outcome: PairOutcome };

/** The id of the pair between two slots. */
export function pairId(fromKey: string, toKey: string): string {
  return `${fromKey}>${toKey}`;
}

/**
 * The state of a builder session: a reopened draft keeps its stored paths
 * (`ok`); a pair saved as `null` has no entry, so the first `sync` retries it.
 */
export function createPairRoutingState(seed: readonly SeedPair[] = []): PairRoutingState {
  const pairs = new Map<string, PairEntry>();
  for (const { id, from, to, path } of seed) {
    if (path !== null) pairs.set(id, { from, to, phase: "ok", path, token: 0 });
  }
  return { pairs, nextToken: 1, unavailable: false };
}

function sameEndpoints(entry: PairEntry, pair: PairInput): boolean {
  return (
    entry.from.lat === pair.from.lat &&
    entry.from.lng === pair.from.lng &&
    entry.to.lat === pair.to.lat &&
    entry.to.lng === pair.to.lng
  );
}

export function pairRoutingReducer(state: PairRoutingState, action: PairRoutingAction): PairRoutingState {
  switch (action.type) {
    case "sync": {
      const pairs = new Map<string, PairEntry>();
      let nextToken = state.nextToken;
      for (const pair of action.pairs) {
        const kept = state.pairs.get(pair.id);
        if (kept && sameEndpoints(kept, pair)) {
          pairs.set(pair.id, kept);
        } else if (state.unavailable) {
          pairs.set(pair.id, { from: pair.from, to: pair.to, phase: "idle", path: null, token: 0 });
        } else {
          pairs.set(pair.id, { from: pair.from, to: pair.to, phase: "routing", path: null, token: nextToken++ });
        }
      }
      const unchanged =
        pairs.size === state.pairs.size && [...pairs].every(([id, entry]) => state.pairs.get(id) === entry);
      return unchanged ? state : { ...state, pairs, nextToken };
    }
    case "result": {
      const { id, token, outcome } = action;
      const entry = state.pairs.get(id);
      // Superseded by a newer request, or the pair is gone.
      if (!entry || entry.phase !== "routing" || entry.token !== token) return state;

      const pairs = new Map(state.pairs);
      switch (outcome.status) {
        case "ok":
          pairs.set(id, { ...entry, phase: "ok", path: outcome.path });
          return { ...state, pairs };
        case "failed":
          pairs.set(id, { ...entry, phase: "failed", path: null });
          return { ...state, pairs };
        case "unavailable":
          for (const [key, other] of pairs) {
            if (other.phase === "routing") pairs.set(key, { ...other, phase: "idle", path: null, token: 0 });
          }
          return { ...state, pairs, unavailable: true };
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Reading the state
// ---------------------------------------------------------------------------

export interface PairView {
  phase: PairPhase;
  path: string | null;
}

/**
 * What `pair` looks like right now. A pair `sync` hasn't reached yet (just
 * moved or added) counts as routing, so a render never shows a stale path or
 * lets a half-routed map save.
 */
export function pairView(state: PairRoutingState, pair: PairInput): PairView {
  const entry = state.pairs.get(pair.id);
  if (entry && sameEndpoints(entry, pair)) return { phase: entry.phase, path: entry.path };
  return { phase: state.unavailable ? "idle" : "routing", path: null };
}

/** Whether any pair is still waiting for its path: Save waits for this to clear. */
export function hasPendingRoutes(state: PairRoutingState, pairs: readonly PairInput[]): boolean {
  return pairs.some((pair) => pairView(state, pair).phase === "routing");
}

/** The document's `paths`: the street path of every routed pair, `null` (straight line) for the rest. */
export function savedPaths(state: PairRoutingState, pairs: readonly PairInput[]): (string | null)[] {
  return pairs.map((pair) => pairView(state, pair).path);
}

/** The routing endpoint's request for one pair: a car, expressways allowed. */
export function pairRouteRequest(pair: PairInput): RouteRequest {
  return { points: [pair.from, pair.to], profile: "car", expressways: legOptions(POST_MAP_PAIR).expressways };
}

export interface RouteJob {
  id: string;
  token: number;
  request: RouteRequest;
}

/**
 * The requests to start and cancel to bring `inflight` (pair id → token of the
 * request running for it) in line with `state`: start a request for every
 * routing pair that has none running for its token, cancel every running
 * request whose pair is gone, finished, or waiting for a newer token.
 */
export function routingWork(
  state: PairRoutingState,
  inflight: ReadonlyMap<string, number>
): { start: RouteJob[]; abort: string[] } {
  const start: RouteJob[] = [];
  for (const [id, entry] of state.pairs) {
    if (entry.phase !== "routing" || inflight.get(id) === entry.token) continue;
    start.push({ id, token: entry.token, request: pairRouteRequest({ id, from: entry.from, to: entry.to }) });
  }
  const abort: string[] = [];
  for (const [id, token] of inflight) {
    const entry = state.pairs.get(id);
    if (!entry || entry.phase !== "routing" || entry.token !== token) abort.push(id);
  }
  return { start, abort };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export interface PairLineFeature {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] }; // [lng, lat]
  properties: { phase: PairPhase };
}

export interface PairLineCollection {
  type: "FeatureCollection";
  features: PairLineFeature[];
}

/**
 * One line per pair for the live map: a routed pair follows its street path,
 * every other pair is the straight line between its pins. `phase` tells the
 * map how to style it.
 */
export function pairLines(state: PairRoutingState, pairs: readonly PairInput[]): PairLineCollection {
  return {
    type: "FeatureCollection",
    features: pairs.map((pair): PairLineFeature => {
      const { phase, path } = pairView(state, pair);
      const points = phase === "ok" && path !== null ? decodePath(path) : [pair.from, pair.to];
      return {
        type: "Feature",
        geometry: { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) },
        properties: { phase },
      };
    }),
  };
}

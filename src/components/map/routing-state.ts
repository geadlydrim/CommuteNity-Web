/**
 * Pure routing state for the stretches of a map that each get a street path: a
 * post map's consecutive pin pairs and a guide's road and walking legs. It
 * tracks which stretches are routing, routed, failed, or left straight, and the
 * latest path of each. No React and no "use client", so Node tests import it
 * directly; `use-routing.ts` runs the requests this state asks for.
 *
 * A stretch is identified by an opaque id and remembers what it was routed for:
 * its points (pins, plus a leg's vias), profile, and expressways choice. `sync`
 * compares the builder's current stretches with that: a stretch whose inputs
 * haven't changed keeps its entry (and path), anything else starts a fresh
 * request. Every request carries the entry's token; a result for a superseded
 * token is ignored, so a slow old answer can't overwrite a newer one.
 *
 * Once the endpoint says routing is `unavailable`, no more requests are asked
 * for and every unrouted stretch stays a straight line.
 */
import { decodePath, type LatLng } from "@/lib/map/path";
import type { RouteProfile, RouteRequest } from "@/lib/schemas/route";

/** `idle`: straight line, nothing requested (routing unavailable). */
export type StretchPhase = "idle" | "routing" | "ok" | "failed";

/** What one stretch is routed for: where, and how. */
export interface StretchInput {
  id: string;
  /** Origin, then any vias, then destination: 2 to 12 points. */
  points: readonly LatLng[];
  profile: RouteProfile;
  /** Car only; a walking stretch carries `false`. */
  expressways: boolean;
}

/** A stretch of a reopened draft, with the path it was saved with. */
export interface SeedStretch extends StretchInput {
  path: string | null;
}

interface StretchEntry {
  points: readonly LatLng[];
  profile: RouteProfile;
  expressways: boolean;
  phase: StretchPhase;
  /** The street path while `ok`, else `null`. */
  path: string | null;
  /** Token of the request this entry waits for (0 = none was made). */
  token: number;
}

export interface RoutingState {
  stretches: ReadonlyMap<string, StretchEntry>;
  nextToken: number;
  /** The endpoint reported no router: stop requesting for the rest of the session. */
  unavailable: boolean;
}

/** What a finished request tells the state. */
export type RoutingOutcome = { status: "ok"; path: string } | { status: "failed" } | { status: "unavailable" };

export type RoutingAction =
  /** The builder's stretches changed (pin placed, moved, removed, reordered; mode or expressways changed). */
  | { type: "sync"; stretches: readonly StretchInput[] }
  | { type: "result"; id: string; token: number; outcome: RoutingOutcome };

/**
 * The state of a builder session: a reopened draft keeps its stored paths
 * (`ok`); a stretch saved as `null` has no entry, so the first `sync` retries it.
 */
export function createRoutingState(seed: readonly SeedStretch[] = []): RoutingState {
  const stretches = new Map<string, StretchEntry>();
  for (const { id, points, profile, expressways, path } of seed) {
    if (path !== null) stretches.set(id, { points, profile, expressways, phase: "ok", path, token: 0 });
  }
  return { stretches, nextToken: 1, unavailable: false };
}

function sameInputs(entry: StretchEntry, input: StretchInput): boolean {
  return (
    entry.profile === input.profile &&
    entry.expressways === input.expressways &&
    entry.points.length === input.points.length &&
    entry.points.every((p, i) => p.lat === input.points[i]?.lat && p.lng === input.points[i]?.lng)
  );
}

export function routingReducer(state: RoutingState, action: RoutingAction): RoutingState {
  switch (action.type) {
    case "sync": {
      const stretches = new Map<string, StretchEntry>();
      let nextToken = state.nextToken;
      for (const input of action.stretches) {
        const { id, points, profile, expressways } = input;
        const kept = state.stretches.get(id);
        if (kept && sameInputs(kept, input)) {
          stretches.set(id, kept);
        } else if (state.unavailable) {
          stretches.set(id, { points, profile, expressways, phase: "idle", path: null, token: 0 });
        } else {
          stretches.set(id, { points, profile, expressways, phase: "routing", path: null, token: nextToken++ });
        }
      }
      const unchanged =
        stretches.size === state.stretches.size &&
        [...stretches].every(([id, entry]) => state.stretches.get(id) === entry);
      return unchanged ? state : { ...state, stretches, nextToken };
    }
    case "result": {
      const { id, token, outcome } = action;
      const entry = state.stretches.get(id);
      // Superseded by a newer request, or the stretch is gone.
      if (!entry || entry.phase !== "routing" || entry.token !== token) return state;

      const stretches = new Map(state.stretches);
      switch (outcome.status) {
        case "ok":
          stretches.set(id, { ...entry, phase: "ok", path: outcome.path });
          return { ...state, stretches };
        case "failed":
          stretches.set(id, { ...entry, phase: "failed", path: null });
          return { ...state, stretches };
        case "unavailable":
          for (const [key, other] of stretches) {
            if (other.phase === "routing") stretches.set(key, { ...other, phase: "idle", path: null, token: 0 });
          }
          return { ...state, stretches, unavailable: true };
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Reading the state
// ---------------------------------------------------------------------------

export interface StretchView {
  phase: StretchPhase;
  path: string | null;
}

/**
 * What `stretch` looks like right now. A stretch `sync` hasn't reached yet
 * (just moved or added) counts as routing, so a render never shows a stale path
 * or lets a half-routed map save.
 */
export function stretchView(state: RoutingState, stretch: StretchInput): StretchView {
  const entry = state.stretches.get(stretch.id);
  if (entry && sameInputs(entry, stretch)) return { phase: entry.phase, path: entry.path };
  return { phase: state.unavailable ? "idle" : "routing", path: null };
}

/** Whether any stretch is still waiting for its path: Save waits for this to clear. */
export function hasPendingRoutes(state: RoutingState, stretches: readonly StretchInput[]): boolean {
  return stretches.some((stretch) => stretchView(state, stretch).phase === "routing");
}

/** The saved `path` of every stretch: the street path of a routed one, `null` (straight line) for the rest. */
export function savedPaths(state: RoutingState, stretches: readonly StretchInput[]): (string | null)[] {
  return stretches.map((stretch) => stretchView(state, stretch).path);
}

export interface RouteJob {
  id: string;
  token: number;
  request: RouteRequest;
}

/**
 * The requests to start and cancel to bring `inflight` (stretch id → token of
 * the request running for it) in line with `state`: start a request for every
 * routing stretch that has none running for its token, cancel every running
 * request whose stretch is gone, finished, or waiting for a newer token.
 */
export function routingWork(
  state: RoutingState,
  inflight: ReadonlyMap<string, number>
): { start: RouteJob[]; abort: string[] } {
  const start: RouteJob[] = [];
  for (const [id, entry] of state.stretches) {
    if (entry.phase !== "routing" || inflight.get(id) === entry.token) continue;
    start.push({
      id,
      token: entry.token,
      request: { points: [...entry.points], profile: entry.profile, expressways: entry.expressways },
    });
  }
  const abort: string[] = [];
  for (const [id, token] of inflight) {
    const entry = state.stretches.get(id);
    if (!entry || entry.phase !== "routing" || entry.token !== token) abort.push(id);
  }
  return { start, abort };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export interface StretchLineFeature {
  type: "Feature";
  geometry: { type: "LineString"; coordinates: [number, number][] }; // [lng, lat]
  properties: { id: string; phase: StretchPhase };
}

export interface StretchLineCollection {
  type: "FeatureCollection";
  features: StretchLineFeature[];
}

/**
 * The live map's line for one stretch: a routed stretch follows its street
 * path, every other one is the straight line between its first and last point.
 * `phase` tells the map how to style it.
 */
export function stretchLine(state: RoutingState, stretch: StretchInput): StretchLineFeature {
  const { phase, path } = stretchView(state, stretch);
  const first = stretch.points[0];
  const last = stretch.points.at(-1);
  const points = phase === "ok" && path !== null ? decodePath(path) : first && last ? [first, last] : [];
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: points.map((p) => [p.lng, p.lat]) },
    properties: { id: stretch.id, phase },
  };
}

/** One line per stretch, in order. */
export function stretchLines(state: RoutingState, stretches: readonly StretchInput[]): StretchLineCollection {
  return { type: "FeatureCollection", features: stretches.map((stretch) => stretchLine(state, stretch)) };
}

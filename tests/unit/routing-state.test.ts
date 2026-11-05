import { describe, expect, it } from "vitest";
import {
  createRoutingState,
  hasPendingRoutes,
  stretchLines,
  routingReducer,
  stretchView,
  routingWork,
  savedPaths,
  type StretchInput,
  type RoutingOutcome,
  type RoutingState,
} from "@/components/map/routing-state";
import { pairStretch } from "@/components/map/route-stretches";

const MANILA = { lat: 14.5995, lng: 120.9842 };
const ANGELES = { lat: 15.145, lng: 120.5887 };
const BAGUIO = { lat: 16.4023, lng: 120.596 };
const LA_UNION = { lat: 16.6159, lng: 120.3209 };
const TARLAC = { lat: 15.4755, lng: 120.5963 };

/** The Google polyline documentation example: (38.5, -120.2), (40.7, -120.95), (43.252, -126.453). */
const ENCODED = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
const OTHER_ENCODED = "??";

const pair = pairStretch;

/** Routes every stretch in `stretches` successfully, in order. */
function routeAll(state: RoutingState, stretches: readonly StretchInput[], path = ENCODED): RoutingState {
  let next = routingReducer(state, { type: "sync", stretches });
  for (const job of routingWork(next, new Map()).start) {
    next = routingReducer(next, {
      type: "result",
      id: job.id,
      token: job.token,
      outcome: { status: "ok", path },
    });
  }
  return next;
}

function startedIds(state: RoutingState, inflight = new Map<string, number>()): string[] {
  return routingWork(state, inflight).start.map((job) => job.id);
}

function tokenOf(state: RoutingState, id: string): number {
  const job = routingWork(state, new Map()).start.find((j) => j.id === id);
  if (!job) throw new Error(`pair ${id} is not routing`);
  return job.token;
}

const result = (id: string, token: number, outcome: RoutingOutcome) =>
  ({ type: "result", id, token, outcome }) as const;

describe("which pairs a pin operation re-routes", () => {
  const abc = [pair("ab", MANILA, ANGELES), pair("bc", ANGELES, BAGUIO)];

  it("routes every pair the first time and asks for a car route with expressways allowed", () => {
    const state = routingReducer(createRoutingState(), { type: "sync", stretches: abc });

    const { start, abort } = routingWork(state, new Map());
    expect(start.map((job) => job.id)).toEqual(["ab", "bc"]);
    expect(start[0]?.request).toEqual({ points: [MANILA, ANGELES], profile: "car", expressways: true });
    expect(start[1]?.request).toEqual({ points: [ANGELES, BAGUIO], profile: "car", expressways: true });
    expect(abort).toEqual([]);
  });

  it("moving a pin re-routes only the pairs next to it", () => {
    const abcd = [pair("ab", MANILA, ANGELES), pair("bc", ANGELES, BAGUIO), pair("cd", BAGUIO, LA_UNION)];
    const routed = routeAll(createRoutingState(), abcd);

    // Pin B moves: ab and bc change; cd does not.
    const moved = routingReducer(routed, {
      type: "sync",
      stretches: [pair("ab", MANILA, TARLAC), pair("bc", TARLAC, BAGUIO), abcd[2]!],
    });

    expect(startedIds(moved)).toEqual(["ab", "bc"]);
    expect(stretchView(moved, pair("cd", BAGUIO, LA_UNION))).toEqual({ phase: "ok", path: ENCODED });
  });

  it("moving the origin re-routes only the first pair", () => {
    const routed = routeAll(createRoutingState(), abc);

    const moved = routingReducer(routed, {
      type: "sync",
      stretches: [pair("ab", TARLAC, ANGELES), abc[1]!],
    });

    expect(startedIds(moved)).toEqual(["ab"]);
    expect(stretchView(moved, abc[1]!)).toEqual({ phase: "ok", path: ENCODED });
  });

  it("removing a middle pin routes the one new pair and forgets the two it replaced", () => {
    const routed = routeAll(createRoutingState(), abc);

    const removed = routingReducer(routed, { type: "sync", stretches: [pair("ac", MANILA, BAGUIO)] });

    expect(startedIds(removed)).toEqual(["ac"]);
    expect(stretchView(removed, abc[0]!).phase).toBe("routing");
    expect(routingWork(removed, new Map([["ab", 1]])).abort).toEqual(["ab"]);
  });

  it("placing a waypoint between two routed pins routes the two new pairs", () => {
    const routed = routeAll(createRoutingState(), [pair("ac", MANILA, BAGUIO)]);

    const added = routingReducer(routed, {
      type: "sync",
      stretches: [pair("aw", MANILA, ANGELES), pair("wc", ANGELES, BAGUIO)],
    });

    expect(startedIds(added)).toEqual(["aw", "wc"]);
  });

  it("changing nothing about the pins asks for nothing and returns the same state", () => {
    const routed = routeAll(createRoutingState(), abc);

    const again = routingReducer(routed, { type: "sync", stretches: abc });

    expect(again).toBe(routed);
    expect(startedIds(again)).toEqual([]);
  });

  it("keeps a failed pair as it is until one of its pins moves", () => {
    let state = routingReducer(createRoutingState(), { type: "sync", stretches: [abc[0]!] });
    state = routingReducer(state, result("ab", tokenOf(state, "ab"), { status: "failed" }));

    const same = routingReducer(state, { type: "sync", stretches: [abc[0]!] });
    expect(stretchView(same, abc[0]!).phase).toBe("failed");
    expect(startedIds(same)).toEqual([]);

    const moved = routingReducer(same, { type: "sync", stretches: [pair("ab", TARLAC, ANGELES)] });
    expect(startedIds(moved)).toEqual(["ab"]);
  });
});

describe("pair phases", () => {
  const ab = pair("ab", MANILA, ANGELES);

  it("a pair is routing from the moment it is requested", () => {
    const state = routingReducer(createRoutingState(), { type: "sync", stretches: [ab] });

    expect(stretchView(state, ab)).toEqual({ phase: "routing", path: null });
  });

  it("a pair the state hasn't seen yet already counts as routing, so a render never shows a stale line", () => {
    const routed = routeAll(createRoutingState(), [ab]);
    const movedPair = pair("ab", TARLAC, ANGELES);

    expect(stretchView(routed, movedPair)).toEqual({ phase: "routing", path: null });
    expect(hasPendingRoutes(routed, [movedPair])).toBe(true);
  });

  it("an answer turns a routing pair into a routed pair with its path", () => {
    let state = routingReducer(createRoutingState(), { type: "sync", stretches: [ab] });

    state = routingReducer(state, result("ab", tokenOf(state, "ab"), { status: "ok", path: ENCODED }));

    expect(stretchView(state, ab)).toEqual({ phase: "ok", path: ENCODED });
  });

  it("a failure turns a routing pair into a failed pair with no path", () => {
    let state = routingReducer(createRoutingState(), { type: "sync", stretches: [ab] });

    state = routingReducer(state, result("ab", tokenOf(state, "ab"), { status: "failed" }));

    expect(stretchView(state, ab)).toEqual({ phase: "failed", path: null });
  });

  it("a moved pair drops its old path while it routes again", () => {
    const routed = routeAll(createRoutingState(), [ab]);

    const moved = routingReducer(routed, { type: "sync", stretches: [pair("ab", TARLAC, ANGELES)] });

    expect(stretchView(moved, pair("ab", TARLAC, ANGELES))).toEqual({ phase: "routing", path: null });
  });
});

describe("superseded requests", () => {
  const ab = pair("ab", MANILA, ANGELES);
  const moved = pair("ab", TARLAC, ANGELES);

  it("ignores the answer to a request its pair has since replaced, and applies the newer one", () => {
    let state = routingReducer(createRoutingState(), { type: "sync", stretches: [ab] });
    const oldToken = tokenOf(state, "ab");
    state = routingReducer(state, { type: "sync", stretches: [moved] });
    const newToken = tokenOf(state, "ab");
    expect(newToken).not.toBe(oldToken);

    state = routingReducer(state, result("ab", oldToken, { status: "ok", path: OTHER_ENCODED }));
    expect(stretchView(state, moved)).toEqual({ phase: "routing", path: null });

    state = routingReducer(state, result("ab", newToken, { status: "ok", path: ENCODED }));
    expect(stretchView(state, moved)).toEqual({ phase: "ok", path: ENCODED });

    // A late failure of the old request can't undo the newer path either.
    state = routingReducer(state, result("ab", oldToken, { status: "failed" }));
    expect(stretchView(state, moved)).toEqual({ phase: "ok", path: ENCODED });
  });

  it("ignores an answer for a pair that was removed", () => {
    let state = routingReducer(createRoutingState(), { type: "sync", stretches: [ab] });
    const token = tokenOf(state, "ab");
    state = routingReducer(state, { type: "sync", stretches: [] });

    const after = routingReducer(state, result("ab", token, { status: "ok", path: ENCODED }));

    expect(after).toBe(state);
  });

  it("cancels the running request of a re-requested pair and starts its replacement", () => {
    let state = routingReducer(createRoutingState(), { type: "sync", stretches: [ab] });
    const oldToken = tokenOf(state, "ab");
    state = routingReducer(state, { type: "sync", stretches: [moved] });

    const work = routingWork(state, new Map([["ab", oldToken]]));

    expect(work.abort).toEqual(["ab"]);
    expect(work.start.map((job) => job.id)).toEqual(["ab"]);
    expect(work.start[0]?.request.points).toEqual([TARLAC, ANGELES]);
  });

  it("leaves a request alone while it is the one its pair waits for", () => {
    const state = routingReducer(createRoutingState(), { type: "sync", stretches: [ab] });

    const work = routingWork(state, new Map([["ab", tokenOf(state, "ab")]]));

    expect(work).toEqual({ start: [], abort: [] });
  });

  it("cancels the running request of a pair that finished or was removed", () => {
    let state = routingReducer(createRoutingState(), { type: "sync", stretches: [ab] });
    const token = tokenOf(state, "ab");
    state = routingReducer(state, result("ab", token, { status: "ok", path: ENCODED }));
    expect(routingWork(state, new Map([["ab", token]])).abort).toEqual(["ab"]);

    state = routingReducer(state, { type: "sync", stretches: [] });
    expect(routingWork(state, new Map([["ab", token]])).abort).toEqual(["ab"]);
  });
});

describe("save readiness", () => {
  const abc = [pair("ab", MANILA, ANGELES), pair("bc", ANGELES, BAGUIO)];

  it("waits while any pair is routing and clears once every pair has finished or failed", () => {
    let state = routingReducer(createRoutingState(), { type: "sync", stretches: abc });
    expect(hasPendingRoutes(state, abc)).toBe(true);

    state = routingReducer(state, result("ab", tokenOf(state, "ab"), { status: "ok", path: ENCODED }));
    expect(hasPendingRoutes(state, abc)).toBe(true);

    state = routingReducer(state, result("bc", tokenOf(state, "bc"), { status: "failed" }));
    expect(hasPendingRoutes(state, abc)).toBe(false);
  });

  it("saves the path of a routed pair and null for a failed one", () => {
    let state = routingReducer(createRoutingState(), { type: "sync", stretches: abc });
    state = routingReducer(state, result("ab", tokenOf(state, "ab"), { status: "ok", path: ENCODED }));
    state = routingReducer(state, result("bc", tokenOf(state, "bc"), { status: "failed" }));

    expect(savedPaths(state, abc)).toEqual([ENCODED, null]);
  });

  it("has nothing pending without pairs", () => {
    expect(hasPendingRoutes(createRoutingState(), [])).toBe(false);
    expect(savedPaths(createRoutingState(), [])).toEqual([]);
  });
});

describe("routing unavailable", () => {
  const abc = [pair("ab", MANILA, ANGELES), pair("bc", ANGELES, BAGUIO)];

  function unavailableAfterFirstAnswer() {
    let state = routingReducer(createRoutingState(), { type: "sync", stretches: abc });
    const abToken = tokenOf(state, "ab");
    const bcToken = tokenOf(state, "bc");
    state = routingReducer(state, result("ab", abToken, { status: "unavailable" }));
    return { state, abToken, bcToken };
  }

  it("keeps every pair straight and unblocks Save, with no failure to report", () => {
    const { state } = unavailableAfterFirstAnswer();

    expect(abc.map((p) => stretchView(state, p))).toEqual([
      { phase: "idle", path: null },
      { phase: "idle", path: null },
    ]);
    expect(hasPendingRoutes(state, abc)).toBe(false);
    expect(savedPaths(state, abc)).toEqual([null, null]);
  });

  it("cancels the requests still running and starts none", () => {
    const { state, abToken, bcToken } = unavailableAfterFirstAnswer();

    const work = routingWork(
      state,
      new Map([
        ["ab", abToken],
        ["bc", bcToken],
      ])
    );

    expect(work.start).toEqual([]);
    expect(work.abort).toEqual(["ab", "bc"]);
  });

  it("makes no request for a pin placed or moved afterwards", () => {
    const { state } = unavailableAfterFirstAnswer();

    const later = routingReducer(state, {
      type: "sync",
      stretches: [pair("ab", TARLAC, ANGELES), pair("bc", ANGELES, BAGUIO), pair("cd", BAGUIO, LA_UNION)],
    });

    expect(startedIds(later)).toEqual([]);
    expect(hasPendingRoutes(later, [pair("cd", BAGUIO, LA_UNION)])).toBe(false);
    expect(stretchView(later, pair("cd", BAGUIO, LA_UNION)).phase).toBe("idle");
  });

  it("keeps the path of a pair that was already routed", () => {
    let state = routingReducer(createRoutingState(), { type: "sync", stretches: abc });
    state = routingReducer(state, result("ab", tokenOf(state, "ab"), { status: "ok", path: ENCODED }));
    state = routingReducer(state, result("bc", tokenOf(state, "bc"), { status: "unavailable" }));

    expect(savedPaths(state, abc)).toEqual([ENCODED, null]);
  });
});

describe("reopening a draft", () => {
  const abc = [pair("ab", MANILA, ANGELES), pair("bc", ANGELES, BAGUIO)];

  it("keeps stored paths and routes only the pairs saved as null", () => {
    const seeded = createRoutingState([
      { ...abc[0]!, path: ENCODED },
      { ...abc[1]!, path: null },
    ]);

    expect(stretchView(seeded, abc[0]!)).toEqual({ phase: "ok", path: ENCODED });

    const synced = routingReducer(seeded, { type: "sync", stretches: abc });

    expect(startedIds(synced)).toEqual(["bc"]);
    expect(stretchView(synced, abc[0]!)).toEqual({ phase: "ok", path: ENCODED });
    expect(savedPaths(routeAll(synced, abc), abc)).toEqual([ENCODED, ENCODED]);
  });

  it("re-routes a stored pair whose pin moved before anything was requested", () => {
    const seeded = createRoutingState([{ ...abc[0]!, path: ENCODED }]);

    const synced = routingReducer(seeded, { type: "sync", stretches: [pair("ab", TARLAC, ANGELES)] });

    expect(startedIds(synced)).toEqual(["ab"]);
  });
});

describe("drawing the pairs", () => {
  it("draws a routed pair along its path as [lng, lat] and every other pair straight, tagged with its phase", () => {
    const routed = pair("ab", MANILA, ANGELES);
    const waiting = pair("bc", ANGELES, BAGUIO);
    const broken = pair("cd", BAGUIO, LA_UNION);
    let state = routingReducer(createRoutingState(), {
      type: "sync",
      stretches: [routed, waiting, broken],
    });
    state = routingReducer(state, result("ab", tokenOf(state, "ab"), { status: "ok", path: ENCODED }));
    state = routingReducer(state, result("cd", tokenOf(state, "cd"), { status: "failed" }));

    const lines = stretchLines(state, [routed, waiting, broken]);

    expect(lines.features.map((f) => f.properties.phase)).toEqual(["ok", "routing", "failed"]);
    expect(lines.features[0]?.geometry.coordinates).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
    expect(lines.features[1]?.geometry.coordinates).toEqual([
      [ANGELES.lng, ANGELES.lat],
      [BAGUIO.lng, BAGUIO.lat],
    ]);
    expect(lines.features[2]?.geometry.coordinates).toEqual([
      [BAGUIO.lng, BAGUIO.lat],
      [LA_UNION.lng, LA_UNION.lat],
    ]);
  });
});

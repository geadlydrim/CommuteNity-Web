import { describe, expect, it } from "vitest";
import {
  createRoutingState,
  hasPendingRoutes,
  routingReducer,
  routingWork,
  savedPaths,
  stretchLines,
  stretchView,
  type RoutingOutcome,
  type RoutingState,
  type StretchInput,
} from "@/components/map/routing-state";
import {
  hasExpresswaysChoice,
  legStretch,
  legStretches,
  pairId,
  pairStretch,
  withMode,
  type RoutedLeg,
} from "@/components/map/route-stretches";
import type { TransportMode } from "@/lib/schemas/modes";

const MANILA = { lat: 14.5995, lng: 120.9842 };
const MAKATI = { lat: 14.5547, lng: 121.0244 };
const ANGELES = { lat: 15.145, lng: 120.5887 };
const BAGUIO = { lat: 16.4023, lng: 120.596 };
const LA_UNION = { lat: 16.6159, lng: 120.3209 };
const TARLAC = { lat: 15.4755, lng: 120.5963 };

/** The Google polyline documentation example: (38.5, -120.2), (40.7, -120.95), (43.252, -126.453). */
const PATH_A = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
const PATH_B = "??";

const leg = (id: string, mode: TransportMode, expressways = false, vias: RoutedLeg["vias"] = []): RoutedLeg => ({
  id,
  mode,
  expressways,
  vias,
});

type Ends = { origin: typeof MANILA | null; destination: typeof MANILA | null };

/** A guide of legs with every end placed at `ends[legId]`. */
const endsFrom = (ends: Record<string, Ends>) => (legId: string) => ends[legId] ?? { origin: null, destination: null };

const sync = (state: RoutingState, stretches: readonly StretchInput[]) =>
  routingReducer(state, { type: "sync", stretches });

const result = (id: string, token: number, outcome: RoutingOutcome) =>
  ({ type: "result", id, token, outcome }) as const;

function started(state: RoutingState, inflight = new Map<string, number>()) {
  return routingWork(state, inflight).start;
}

function startedIds(state: RoutingState, inflight = new Map<string, number>()): string[] {
  return started(state, inflight).map((job) => job.id);
}

function tokenOf(state: RoutingState, id: string): number {
  const job = started(state).find((j) => j.id === id);
  if (!job) throw new Error(`stretch ${id} is not routing`);
  return job.token;
}

/** Answers every routing stretch with `path`. */
function routeAll(state: RoutingState, path = PATH_A): RoutingState {
  let next = state;
  for (const job of started(state)) {
    next = routingReducer(next, result(job.id, job.token, { status: "ok", path }));
  }
  return next;
}

describe("what a leg is routed as", () => {
  const ends = { origin: MANILA, destination: ANGELES };

  it.each([
    ["walking", { profile: "walk", expressways: false }],
    ["jeepney", { profile: "car", expressways: false }],
    ["bus", { profile: "car", expressways: false }],
    ["tricycle", { profile: "car", expressways: false }],
  ] as const)("a %s leg is routed %o with its stored expressways choice", (mode, expected) => {
    expect(legStretch(leg("a", mode), ends.origin, ends.destination)).toEqual({
      id: "a",
      points: [MANILA, ANGELES],
      ...expected,
    });
  });

  it.each(["uv_express", "p2p"] as const)("a %s leg flipped to allow expressways is routed as a car with them allowed", (mode) => {
    expect(legStretch(leg("a", mode, true), MANILA, ANGELES)).toEqual({
      id: "a",
      points: [MANILA, ANGELES],
      profile: "car",
      expressways: true,
    });
  });

  it("follows the leg's own choice, not the mode's default", () => {
    expect(legStretch(leg("a", "jeepney", true), MANILA, ANGELES)?.expressways).toBe(true);
    expect(legStretch(leg("a", "uv_express", false), MANILA, ANGELES)?.expressways).toBe(false);
  });

  it("never lets a walking leg use expressways, whatever is stored", () => {
    expect(legStretch(leg("a", "walking", true), MANILA, ANGELES)?.expressways).toBe(false);
  });

  it("routes through the leg's vias in order, between its origin and destination", () => {
    const vias = [
      { lat: 15.0, lng: 120.7 },
      { lat: 15.3, lng: 120.6 },
    ];

    expect(legStretch(leg("a", "bus", false, vias), MANILA, BAGUIO)?.points).toEqual([
      MANILA,
      { lat: 15.0, lng: 120.7 },
      { lat: 15.3, lng: 120.6 },
      BAGUIO,
    ]);
  });

  it("does not route a rail leg: it follows the rail file", () => {
    expect(legStretch(leg("a", "mrt"), MANILA, ANGELES)).toBeNull();
    expect(legStretch(leg("a", "lrt"), MANILA, ANGELES)).toBeNull();
  });

  it.each(["jeepney", "bus", "tricycle", "uv_express", "p2p"] as const)("offers the expressways switch on a %s leg", (mode) => {
    expect(hasExpresswaysChoice(mode)).toBe(true);
  });

  it.each(["walking", "mrt", "lrt"] as const)("offers no expressways switch on a %s leg", (mode) => {
    expect(hasExpresswaysChoice(mode)).toBe(false);
  });
});

describe("which legs of a guide are routed", () => {
  it("lists the routable legs with both ends placed, in leg order", () => {
    const legs = [leg("walk", "walking"), leg("half", "bus"), leg("train", "mrt"), leg("ride", "uv_express", true)];
    const ends = endsFrom({
      walk: { origin: MANILA, destination: MAKATI },
      half: { origin: ANGELES, destination: null },
      train: { origin: MAKATI, destination: ANGELES },
      ride: { origin: ANGELES, destination: BAGUIO },
    });

    expect(legStretches(legs, ends).map((s) => [s.id, s.profile, s.expressways])).toEqual([
      ["walk", "walk", false],
      ["ride", "car", true],
    ]);
  });

  it("lists nothing for a guide with nothing placed", () => {
    expect(legStretches([leg("a", "bus")], endsFrom({}))).toEqual([]);
  });
});

describe("a leg's mode change", () => {
  it("resets expressways to the new mode's default", () => {
    expect(withMode(leg("a", "jeepney", false), "uv_express").expressways).toBe(true);
    expect(withMode(leg("a", "uv_express", true), "bus").expressways).toBe(false);
    expect(withMode(leg("a", "p2p", true), "walking").expressways).toBe(false);
  });

  it("drops an author's flip: a jeepney allowed on expressways switched to tricycle avoids them again", () => {
    const flipped = leg("a", "jeepney", true);

    expect(withMode(flipped, "tricycle")).toMatchObject({ mode: "tricycle", expressways: false });
  });

  it("keeps the rest of the leg", () => {
    const via = { lat: 15.0, lng: 120.7 };

    expect(withMode(leg("a", "bus", false, [via]), "p2p")).toEqual(leg("a", "p2p", true, [via]));
  });
});

describe("which legs a guide edit re-routes", () => {
  const walk = leg("walk", "walking");
  const jeep = leg("jeep", "jeepney");
  const uv = leg("uv", "uv_express", true);
  const ends = {
    walk: { origin: MANILA, destination: MAKATI },
    jeep: { origin: MAKATI, destination: ANGELES },
    uv: { origin: ANGELES, destination: BAGUIO },
  };
  const stretchesOf = (legs: RoutedLeg[], placed: Record<string, Ends> = ends) => legStretches(legs, endsFrom(placed));
  const routedGuide = () => routeAll(sync(createRoutingState(), stretchesOf([walk, jeep, uv])));

  it("routes every leg the first time, each with its mode's profile", () => {
    const state = sync(createRoutingState(), stretchesOf([walk, jeep, uv]));

    expect(started(state).map((job) => [job.id, job.request.profile, job.request.expressways])).toEqual([
      ["walk", "walk", false],
      ["jeep", "car", false],
      ["uv", "car", true],
    ]);
    expect(started(state)[1]?.request.points).toEqual([MAKATI, ANGELES]);
  });

  it("moving one leg's pin re-routes only that leg", () => {
    const moved = sync(routedGuide(), stretchesOf([walk, jeep, uv], { ...ends, jeep: { origin: MAKATI, destination: TARLAC } }));

    expect(startedIds(moved)).toEqual(["jeep"]);
    expect(stretchView(moved, stretchesOf([walk], ends)[0]!)).toEqual({ phase: "ok", path: PATH_A });
  });

  it("flipping a leg's expressways switch re-routes only that leg, with the new choice and the same points", () => {
    const flipped = sync(routedGuide(), stretchesOf([walk, { ...jeep, expressways: true }, uv]));

    expect(started(flipped).map((job) => [job.id, job.request.expressways, job.request.points])).toEqual([
      ["jeep", true, [MAKATI, ANGELES]],
    ]);
  });

  it("flipping the switch drops the old path while the leg routes again", () => {
    const flippedLeg = { ...uv, expressways: false };
    const flipped = sync(routedGuide(), stretchesOf([walk, jeep, flippedLeg]));

    expect(stretchView(flipped, stretchesOf([flippedLeg])[0]!)).toEqual({ phase: "routing", path: null });
  });

  it("flipping the switch back to a state already answered routes again, the scheduler cache answering it", () => {
    const flipped = sync(routedGuide(), stretchesOf([walk, jeep, { ...uv, expressways: false }]));
    const back = sync(flipped, stretchesOf([walk, jeep, uv]));

    expect(startedIds(back)).toEqual(["uv"]);
  });

  it("switching a leg to a mode with another profile re-routes it with the new profile and default", () => {
    const toWalking = sync(routedGuide(), stretchesOf([walk, withMode(jeep, "walking"), uv]));

    expect(started(toWalking).map((job) => [job.id, job.request.profile, job.request.expressways])).toEqual([
      ["jeep", "walk", false],
    ]);

    const toUv = sync(routedGuide(), stretchesOf([walk, withMode(jeep, "uv_express"), uv]));
    expect(started(toUv).map((job) => [job.id, job.request.profile, job.request.expressways])).toEqual([
      ["jeep", "car", true],
    ]);
  });

  it("switching to a mode with the same profile and default keeps the routed path", () => {
    const toBus = sync(routedGuide(), stretchesOf([walk, withMode(jeep, "bus"), uv]));

    expect(startedIds(toBus)).toEqual([]);
    expect(stretchView(toBus, stretchesOf([jeep])[0]!)).toEqual({ phase: "ok", path: PATH_A });
  });

  it("switching a flipped leg to a same-profile mode resets the switch and re-routes it", () => {
    const flippedJeep = { ...jeep, expressways: true };
    const routed = routeAll(sync(createRoutingState(), stretchesOf([walk, flippedJeep, uv])));

    const toBus = sync(routed, stretchesOf([walk, withMode(flippedJeep, "bus"), uv]));

    expect(started(toBus).map((job) => [job.id, job.request.expressways])).toEqual([["jeep", false]]);
  });

  it("a via added to a leg re-routes only that leg through it", () => {
    const via = { lat: 15.0, lng: 120.7 };
    const reshaped = sync(routedGuide(), stretchesOf([walk, { ...jeep, vias: [via] }, uv]));

    expect(started(reshaped).map((job) => [job.id, job.request.points])).toEqual([
      ["jeep", [MAKATI, via, ANGELES]],
    ]);
  });

  it("adding a leg routes only the new leg", () => {
    const extra = leg("extra", "tricycle");
    const added = sync(
      routedGuide(),
      stretchesOf([walk, jeep, uv, extra], { ...ends, extra: { origin: BAGUIO, destination: LA_UNION } })
    );

    expect(startedIds(added)).toEqual(["extra"]);
  });

  it("placing the second end of a new leg is what first routes it", () => {
    const extra = leg("extra", "tricycle");
    const oneEnd = sync(routedGuide(), stretchesOf([walk, jeep, uv, extra], { ...ends, extra: { origin: BAGUIO, destination: null } }));
    expect(startedIds(oneEnd)).toEqual([]);

    const bothEnds = sync(oneEnd, stretchesOf([walk, jeep, uv, extra], { ...ends, extra: { origin: BAGUIO, destination: LA_UNION } }));
    expect(startedIds(bothEnds)).toEqual(["extra"]);
  });

  it("removing a leg re-routes nothing, forgets it, and cancels its running request", () => {
    const pending = sync(createRoutingState(), stretchesOf([walk, jeep, uv]));
    const jeepToken = tokenOf(pending, "jeep");

    const removed = sync(pending, stretchesOf([walk, uv]));

    expect(startedIds(removed, new Map([["jeep", jeepToken]]))).not.toContain("jeep");
    expect(routingWork(removed, new Map([["jeep", jeepToken]])).abort).toEqual(["jeep"]);

    const routed = routeAll(removed);
    expect(startedIds(sync(routed, stretchesOf([walk, uv])))).toEqual([]);
  });

  it("a leg changed to rail stops being a stretch: its request is cancelled and nothing new is asked for", () => {
    const pending = sync(createRoutingState(), stretchesOf([walk, jeep, uv]));
    const jeepToken = tokenOf(pending, "jeep");

    const toRail = sync(pending, stretchesOf([walk, withMode(jeep, "mrt"), uv]));

    expect(routingWork(toRail, new Map([["jeep", jeepToken]])).abort).toEqual(["jeep"]);
    expect(startedIds(toRail)).not.toContain("jeep");
  });

  it("changing nothing returns the same state", () => {
    const routed = routedGuide();

    expect(sync(routed, stretchesOf([walk, jeep, uv]))).toBe(routed);
  });
});

describe("saving a guide across its legs", () => {
  const walk = leg("walk", "walking");
  const jeep = leg("jeep", "jeepney");
  const ends = {
    walk: { origin: MANILA, destination: MAKATI },
    jeep: { origin: MAKATI, destination: ANGELES },
  };
  const stretches = legStretches([walk, jeep], endsFrom(ends));

  it("waits while any leg is routing and clears once every leg has finished or failed", () => {
    let state = sync(createRoutingState(), stretches);
    expect(hasPendingRoutes(state, stretches)).toBe(true);

    state = routingReducer(state, result("walk", tokenOf(state, "walk"), { status: "ok", path: PATH_A }));
    expect(hasPendingRoutes(state, stretches)).toBe(true);

    state = routingReducer(state, result("jeep", tokenOf(state, "jeep"), { status: "failed" }));
    expect(hasPendingRoutes(state, stretches)).toBe(false);
  });

  it("saves each leg's path, and null for a failed leg", () => {
    let state = sync(createRoutingState(), stretches);
    state = routingReducer(state, result("walk", tokenOf(state, "walk"), { status: "ok", path: PATH_A }));
    state = routingReducer(state, result("jeep", tokenOf(state, "jeep"), { status: "failed" }));

    expect(savedPaths(state, stretches)).toEqual([PATH_A, null]);
  });

  it("goes back to waiting when a leg's switch is flipped after the others finished", () => {
    const routed = routeAll(sync(createRoutingState(), stretches), PATH_B);
    const flipped = legStretches([walk, { ...jeep, expressways: true }], endsFrom(ends));

    expect(hasPendingRoutes(routed, flipped)).toBe(true);
    expect(savedPaths(routed, flipped)).toEqual([PATH_B, null]);
  });

  it("with routing unavailable, every leg stays straight and Save is not blocked", () => {
    let state = sync(createRoutingState(), stretches);
    state = routingReducer(state, result("walk", tokenOf(state, "walk"), { status: "unavailable" }));

    expect(hasPendingRoutes(state, stretches)).toBe(false);
    expect(savedPaths(state, stretches)).toEqual([null, null]);
    expect(startedIds(sync(state, legStretches([walk, { ...jeep, expressways: true }], endsFrom(ends))))).toEqual([]);
  });

  it("a guide with no routable leg has nothing pending", () => {
    const none = legStretches([leg("train", "mrt")], endsFrom({ train: { origin: MANILA, destination: ANGELES } }));

    expect(hasPendingRoutes(createRoutingState(), none)).toBe(false);
    expect(savedPaths(createRoutingState(), none)).toEqual([]);
  });
});

describe("reopening a guide draft", () => {
  const walk = leg("walk", "walking");
  const jeep = leg("jeep", "jeepney");
  const uv = leg("uv", "uv_express", true);
  const ends = {
    walk: { origin: MANILA, destination: MAKATI },
    jeep: { origin: MAKATI, destination: ANGELES },
    uv: { origin: ANGELES, destination: BAGUIO },
  };
  const stretches = legStretches([walk, jeep, uv], endsFrom(ends));

  it("keeps stored leg paths and routes only the legs saved as null", () => {
    const seeded = createRoutingState([
      { ...stretches[0]!, path: PATH_A },
      { ...stretches[1]!, path: null },
      { ...stretches[2]!, path: PATH_B },
    ]);

    const synced = sync(seeded, stretches);

    expect(startedIds(synced)).toEqual(["jeep"]);
    expect(savedPaths(synced, stretches)).toEqual([PATH_A, null, PATH_B]);
  });

  it("re-routes a stored leg whose expressways choice was flipped before anything was requested", () => {
    const seeded = createRoutingState([{ ...stretches[2]!, path: PATH_B }]);

    const synced = sync(seeded, legStretches([{ ...uv, expressways: false }], endsFrom(ends)));

    expect(startedIds(synced)).toEqual(["uv"]);
  });

  it("retries nothing when routing is unavailable and no leg is stored as null", () => {
    const seeded = createRoutingState(stretches.map((s) => ({ ...s, path: PATH_A })));

    expect(startedIds(sync(seeded, stretches))).toEqual([]);
  });
});

describe("drawing a guide's legs", () => {
  it("tags each line with its leg id and phase, routed legs following their path and the rest straight from origin to destination", () => {
    const stretches = legStretches(
      [leg("walk", "walking"), leg("jeep", "jeepney", false, [{ lat: 15.0, lng: 120.7 }])],
      endsFrom({
        walk: { origin: MANILA, destination: MAKATI },
        jeep: { origin: MAKATI, destination: ANGELES },
      })
    );
    let state = sync(createRoutingState(), stretches);
    state = routingReducer(state, result("walk", tokenOf(state, "walk"), { status: "ok", path: PATH_A }));

    const lines = stretchLines(state, stretches);

    expect(lines.features.map((f) => f.properties)).toEqual([
      { id: "walk", phase: "ok" },
      { id: "jeep", phase: "routing" },
    ]);
    expect(lines.features[0]?.geometry.coordinates).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
    // Straight, ignoring the via: the line saved as `null` runs origin to destination.
    expect(lines.features[1]?.geometry.coordinates).toEqual([
      [MAKATI.lng, MAKATI.lat],
      [ANGELES.lng, ANGELES.lat],
    ]);
  });
});

describe("post-map pairs and guide legs share one state", () => {
  it("a post map's pair is a car with expressways allowed, whatever else is routed alongside", () => {
    const pair = pairStretch(pairId("a", "b"), MANILA, ANGELES);

    expect(pair).toEqual({ id: "a>b", points: [MANILA, ANGELES], profile: "car", expressways: true });
  });
});

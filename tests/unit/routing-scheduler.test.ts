import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { driveRouting } from "@/components/map/pair-routing-driver";
import {
  createPairRoutingState,
  pairRoutingReducer,
  pairView,
  savedPaths,
  type PairInput,
  type PairRoutingAction,
  type PairRoutingState,
  type SeedPair,
} from "@/components/map/pair-routing-state";
import { fetchRoute, type RouteOutcome } from "@/lib/routing/client";
import {
  CACHE_LIMIT,
  DEBOUNCE_MS,
  MAX_IN_FLIGHT,
  createRouteScheduler,
  type RouteResult,
  type RouteScheduler,
  type Timers,
} from "@/lib/routing/scheduler";
import type { RouteRequest } from "@/lib/schemas/route";

// ---------------------------------------------------------------------------
// Fakes: a clock the test advances, and a fetch the test answers
// ---------------------------------------------------------------------------

class FakeClock implements Timers {
  private now = 0;
  private nextId = 1;
  private pending = new Map<number, { at: number; callback: () => void }>();

  setTimeout(callback: () => void, ms: number): number {
    const id = this.nextId++;
    this.pending.set(id, { at: this.now + ms, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.pending.delete(handle as number);
  }

  /** Runs every timer due within `ms`, in time order. */
  advance(ms: number): void {
    const target = this.now + ms;
    for (;;) {
      let due: [number, { at: number; callback: () => void }] | undefined;
      for (const entry of this.pending) {
        if (entry[1].at <= target && (!due || entry[1].at < due[1].at)) due = entry;
      }
      if (!due) break;
      this.pending.delete(due[0]);
      this.now = due[1].at;
      due[1].callback();
    }
    this.now = target;
  }

  get timerCount(): number {
    return this.pending.size;
  }
}

interface FetchCall {
  request: RouteRequest;
  signal: AbortSignal;
  reply(body: unknown, status?: number): void;
}

/** Stubs `fetch`: every call waits for the test; an aborted call rejects like the real one. */
function stubFetch(): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((resolve, reject) => {
          const signal = init?.signal;
          if (!signal) throw new Error("the scheduler must pass a signal");
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          calls.push({
            request: JSON.parse(String(init?.body)) as RouteRequest,
            signal,
            reply: (body, status = 200) =>
              resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })),
          });
        })
    )
  );
  return calls;
}

/** Lets the pending fetch promises settle; timers are the fake clock's, so this never advances time. */
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

// Valid precision-5 polylines the client accepts (2+ points). Google's documentation example and prefixes of it.
const PATH_A = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
const PATH_B = "_p~iF~ps|U_ulLnnqC";
const PATH_C = "_ulLnnqC_mqNvxq`@";

const route = (path: string) => ({ path, distanceKm: 1, durationMin: 2 });
const okResult = (path: string) => ({ status: "ok", route: route(path) });

/** A distinct request per `n`: the origin shifts by a thousandth of a degree. */
function request(n: number, overrides: Partial<RouteRequest> = {}): RouteRequest {
  return {
    points: [
      { lat: 14.5 + n / 1000, lng: 121 },
      { lat: 15.1, lng: 120.6 },
    ],
    profile: "car",
    expressways: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------

let clock: FakeClock;
let calls: FetchCall[];
let scheduler: RouteScheduler;

beforeEach(() => {
  clock = new FakeClock();
  calls = stubFetch();
  scheduler = createRouteScheduler({ route: fetchRoute, timers: clock });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Schedules and collects what the job's callback hears. */
function go(key: string, req: RouteRequest): RouteResult[] {
  const heard: RouteResult[] = [];
  scheduler.schedule(key, req, (result) => heard.push(result));
  return heard;
}

/** Schedules, waits out the debounce, and answers the request with `path`. */
async function routed(key: string, req: RouteRequest, path = PATH_A): Promise<RouteResult[]> {
  const heard = go(key, req);
  clock.advance(DEBOUNCE_MS);
  await flush();
  calls.at(-1)?.reply(route(path));
  await flush();
  return heard;
}

describe("debounce", () => {
  it("requests only after 300 ms without a change to the key", async () => {
    const heard = go("a", request(0));
    clock.advance(DEBOUNCE_MS - 1);
    await flush();
    expect(calls).toHaveLength(0);

    clock.advance(1);
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.request).toEqual(request(0));

    calls[0]?.reply(route(PATH_A));
    await flush();
    expect(heard).toEqual([okResult(PATH_A)]);
  });

  it("makes one request, for the last change, when changes follow each other inside the window", async () => {
    const first = go("a", request(0));
    clock.advance(200);
    const second = go("a", request(1));
    clock.advance(200);
    const third = go("a", request(2));
    clock.advance(DEBOUNCE_MS - 1);
    await flush();
    expect(calls).toHaveLength(0);

    clock.advance(1);
    await flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.request).toEqual(request(2));

    calls[0]?.reply(route(PATH_B));
    await flush();
    expect(first).toEqual([]);
    expect(second).toEqual([]);
    expect(third).toEqual([okResult(PATH_B)]);
  });

  it("debounces each key on its own", async () => {
    go("a", request(0));
    clock.advance(200);
    go("b", request(1));
    clock.advance(100);
    await flush();
    expect(calls.map((c) => c.request)).toEqual([request(0)]);

    clock.advance(200);
    await flush();
    expect(calls.map((c) => c.request)).toEqual([request(0), request(1)]);
  });
});

describe("routing on drag release only", () => {
  it("makes no request while a key is held, however long, and routes after release", async () => {
    scheduler.hold("a");
    const heard = go("a", request(0));
    clock.advance(60_000);
    await flush();
    expect(calls).toHaveLength(0);
    expect(clock.timerCount).toBe(0);

    scheduler.release("a");
    clock.advance(DEBOUNCE_MS - 1);
    await flush();
    expect(calls).toHaveLength(0);

    clock.advance(1);
    await flush();
    expect(calls).toHaveLength(1);
    calls[0]?.reply(route(PATH_A));
    await flush();
    expect(heard).toEqual([okResult(PATH_A)]);
  });

  it("pauses a change that was already waiting out its debounce when the drag starts", async () => {
    go("a", request(0));
    clock.advance(250);
    scheduler.hold("a");
    clock.advance(60_000);
    await flush();
    expect(calls).toHaveLength(0);

    scheduler.release("a");
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(calls.map((c) => c.request)).toEqual([request(0)]);
  });

  it("changes made during the drag collapse into one request after release", async () => {
    scheduler.hold("a");
    go("a", request(0));
    go("a", request(1));
    go("a", request(2));
    scheduler.release("a");
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(calls.map((c) => c.request)).toEqual([request(2)]);
  });

  it("holding one key leaves the others routing", async () => {
    scheduler.hold("a");
    go("a", request(0));
    go("b", request(1));
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(calls.map((c) => c.request)).toEqual([request(1)]);
  });

  it("a held key with nothing scheduled does nothing on release", async () => {
    scheduler.hold("a");
    scheduler.release("a");
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(calls).toHaveLength(0);
  });
});

describe("latest request wins", () => {
  it("aborts the older request in flight and applies only the newer result", async () => {
    const older = go("a", request(0));
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(calls).toHaveLength(1);

    const newer = go("a", request(1));
    expect(calls[0]?.signal.aborted).toBe(true);
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(calls).toHaveLength(2);
    expect(calls[1]?.signal.aborted).toBe(false);

    calls[1]?.reply(route(PATH_B));
    await flush();
    expect(older).toEqual([]);
    expect(newer).toEqual([okResult(PATH_B)]);
  });

  it("ignores a late answer from a superseded request that didn't honour the abort", async () => {
    const answers: ((outcome: RouteOutcome) => void)[] = [];
    const stubborn = createRouteScheduler({
      route: () => new Promise<RouteOutcome>((resolve) => answers.push(resolve)),
      timers: clock,
    });
    const older: RouteResult[] = [];
    const newer: RouteResult[] = [];
    stubborn.schedule("a", request(0), (r) => older.push(r));
    clock.advance(DEBOUNCE_MS);
    stubborn.schedule("a", request(1), (r) => newer.push(r));
    clock.advance(DEBOUNCE_MS);
    expect(answers).toHaveLength(2);

    answers[0]?.({ status: "ok", route: route(PATH_A) });
    await flush();
    expect(older).toEqual([]);
    expect(newer).toEqual([]);

    answers[1]?.({ status: "ok", route: route(PATH_B) });
    await flush();
    expect(older).toEqual([]);
    expect(newer).toEqual([okResult(PATH_B)]);
  });

  it("keeps requests for different keys independent", async () => {
    const a = go("a", request(0));
    const b = go("b", request(1));
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => !c.signal.aborted)).toBe(true);

    calls[1]?.reply(route(PATH_B));
    calls[0]?.reply(route(PATH_C));
    await flush();
    expect(a).toEqual([okResult(PATH_C)]);
    expect(b).toEqual([okResult(PATH_B)]);
  });

  it("cancel aborts a running request and drops a waiting one, without calling back", async () => {
    const cancelledRunning = go("a", request(0));
    const untouched = go("b", request(1));
    clock.advance(DEBOUNCE_MS - 1);
    const cancelledWaiting = go("c", request(2));
    clock.advance(1);
    await flush();
    expect(calls).toHaveLength(2);

    scheduler.cancel("a");
    scheduler.cancel("c");
    expect(calls[0]?.signal.aborted).toBe(true);
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(calls).toHaveLength(2);
    expect(cancelledRunning).toEqual([]);
    expect(cancelledWaiting).toEqual([]);

    calls[1]?.reply(route(PATH_B));
    await flush();
    expect(untouched).toEqual([okResult(PATH_B)]);
  });
});

describe("session cache", () => {
  it("answers a repeat from the cache with no request, even for another key", async () => {
    await routed("a", request(0), PATH_B);
    expect(calls).toHaveLength(1);

    const heard = go("b", request(0));
    expect(heard).toEqual([okResult(PATH_B)]);
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(calls).toHaveLength(1);
  });

  it("a cache hit supersedes the key's earlier waiting job", async () => {
    await routed("a", request(0), PATH_B);
    const older = go("a", request(1));
    const hit = go("a", request(0));
    expect(hit).toEqual([okResult(PATH_B)]);
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(calls).toHaveLength(1);
    expect(older).toEqual([]);
  });

  it("answers from the cache when the result arrives during another job's debounce", async () => {
    go("a", request(0));
    clock.advance(200);
    const waiting = go("b", request(0));
    clock.advance(100);
    await flush();
    // `a` requested at 300 ms and is answered before b's debounce ends at 500 ms.
    expect(calls).toHaveLength(1);
    calls[0]?.reply(route(PATH_C));
    await flush();

    clock.advance(200);
    await flush();
    expect(calls).toHaveLength(1);
    expect(waiting).toEqual([okResult(PATH_C)]);
  });

  it("misses when the profile, expressways, or any point differs", async () => {
    await routed("a", request(0));
    expect(calls).toHaveLength(1);

    const variants: RouteRequest[] = [
      request(0, { profile: "walk" }),
      request(0, { expressways: false }),
      request(0, { expressways: undefined }),
      request(1),
      { ...request(0), points: [...request(0).points, { lat: 15.2, lng: 120.7 }] },
    ];
    for (const [i, variant] of variants.entries()) {
      await routed(`k${i}`, variant);
    }
    expect(calls).toHaveLength(1 + variants.length);
  });

  it("does not cache failures", async () => {
    go("a", request(0));
    clock.advance(DEBOUNCE_MS);
    await flush();
    calls[0]?.reply({ error: "No route", code: "failed" }, 502);
    await flush();

    go("a", request(0));
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(calls).toHaveLength(2);
  });

  it("holds up to 100 results and evicts the least recently used", async () => {
    expect(CACHE_LIMIT).toBe(100);
    for (let n = 0; n < CACHE_LIMIT; n++) await routed("a", request(n));
    expect(calls).toHaveLength(100);

    // Touch the oldest, so the next oldest is the one evicted.
    expect(go("a", request(0))).toHaveLength(1);
    await routed("a", request(100));
    expect(calls).toHaveLength(101);

    expect(go("a", request(0))).toHaveLength(1);
    expect(go("a", request(2))).toHaveLength(1);
    expect(go("a", request(100))).toHaveLength(1);
    expect(calls).toHaveLength(101);

    const evicted = go("a", request(1));
    expect(evicted).toEqual([]);
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(calls).toHaveLength(102);
    expect(calls[101]?.request).toEqual(request(1));
  });

  it("is cleared by reset, when the builder closes", async () => {
    await routed("a", request(0));
    scheduler.reset();

    const heard = go("a", request(0));
    expect(heard).toEqual([]);
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(calls).toHaveLength(2);
  });
});

describe("request cap and queue", () => {
  /** Schedules six keys at once and lets the first four start. */
  async function sixKeys(): Promise<Record<string, RouteResult[]>> {
    const heard: Record<string, RouteResult[]> = {};
    for (let n = 0; n < 6; n++) heard[`k${n}`] = go(`k${n}`, request(n));
    clock.advance(DEBOUNCE_MS);
    await flush();
    return heard;
  }

  it("runs at most 4 requests at once and starts the rest, oldest first, as slots free", async () => {
    expect(MAX_IN_FLIGHT).toBe(4);
    const heard = await sixKeys();
    expect(calls.map((c) => c.request)).toEqual([0, 1, 2, 3].map((n) => request(n)));

    calls[1]?.reply(route(PATH_B));
    await flush();
    expect(calls.map((c) => c.request)).toEqual([0, 1, 2, 3, 4].map((n) => request(n)));
    expect(heard.k1).toEqual([okResult(PATH_B)]);

    calls[3]?.reply(route(PATH_C));
    await flush();
    expect(calls.map((c) => c.request)).toEqual([0, 1, 2, 3, 4, 5].map((n) => request(n)));

    calls[0]?.reply(route(PATH_A));
    calls[2]?.reply(route(PATH_A));
    calls[4]?.reply(route(PATH_A));
    calls[5]?.reply(route(PATH_A));
    await flush();
    expect(calls).toHaveLength(6);
    for (const results of Object.values(heard)) expect(results).toHaveLength(1);
  });

  it("a failure also frees its slot", async () => {
    await sixKeys();
    calls[0]?.reply({ error: "Busy", code: "busy" }, 429);
    await flush();
    expect(calls).toHaveLength(5);
  });

  it("a superseded queued job never starts; its replacement queues behind the others", async () => {
    const heard = await sixKeys();
    const replacement = go("k4", request(40));
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(calls).toHaveLength(4);

    calls[0]?.reply(route(PATH_A));
    await flush();
    expect(calls[4]?.request).toEqual(request(5));
    calls[1]?.reply(route(PATH_A));
    await flush();
    expect(calls[5]?.request).toEqual(request(40));
    expect(calls).toHaveLength(6);
    expect(heard.k4).toEqual([]);

    calls[5]?.reply(route(PATH_B));
    await flush();
    expect(replacement).toEqual([okResult(PATH_B)]);
  });

  it("a cancelled queued job never starts", async () => {
    await sixKeys();
    scheduler.cancel("k4");
    calls[0]?.reply(route(PATH_A));
    await flush();
    expect(calls[4]?.request).toEqual(request(5));
    expect(calls).toHaveLength(5);
  });

  it("aborting a running request for a newer one frees its slot at once for the queue", async () => {
    await sixKeys();
    go("k0", request(50));
    expect(calls[0]?.signal.aborted).toBe(true);
    await flush();
    expect(calls).toHaveLength(5);
    expect(calls[4]?.request).toEqual(request(4));

    clock.advance(DEBOUNCE_MS);
    await flush();
    // k5 is still queued ahead of the replacement for k0, and all four slots are busy.
    expect(calls).toHaveLength(5);
    calls[1]?.reply(route(PATH_A));
    await flush();
    expect(calls[5]?.request).toEqual(request(5));
  });
});

describe("busy and timed-out replies", () => {
  it.each([
    ["busy", 429, "Too many routing requests"],
    ["timeout", 504, "Routing took too long"],
  ] as const)("marks a %s reply failed and never retries it", async (code, status, message) => {
    const heard = go("a", request(0));
    clock.advance(DEBOUNCE_MS);
    await flush();
    calls[0]?.reply({ error: message, code }, status);
    await flush();

    expect(heard).toEqual([{ status: "failed", code, message }]);
    clock.advance(10 * 60_000);
    await flush();
    expect(calls).toHaveLength(1);
    expect(clock.timerCount).toBe(0);
  });
});

describe("routing unavailable", () => {
  it("answers every live job unavailable, aborts their requests, and makes no further request", async () => {
    const a = go("a", request(0));
    const b = go("b", request(1));
    const c = go("c", request(2));
    clock.advance(DEBOUNCE_MS - 1);
    const waiting = go("d", request(3));
    clock.advance(1);
    await flush();
    expect(calls).toHaveLength(3);

    calls[0]?.reply({ error: "Routing is off", code: "unavailable" }, 503);
    await flush();
    expect(a).toEqual([{ status: "unavailable" }]);
    expect(b).toEqual([{ status: "unavailable" }]);
    expect(c).toEqual([{ status: "unavailable" }]);
    expect(waiting).toEqual([{ status: "unavailable" }]);
    expect(calls[1]?.signal.aborted).toBe(true);
    expect(calls[2]?.signal.aborted).toBe(true);

    const later = go("e", request(4));
    expect(later).toEqual([{ status: "unavailable" }]);
    clock.advance(60_000);
    await flush();
    expect(calls).toHaveLength(3);
  });

  it("asks again after reset, in a new session", async () => {
    go("a", request(0));
    clock.advance(DEBOUNCE_MS);
    await flush();
    calls[0]?.reply({ error: "Routing is off", code: "unavailable" }, 503);
    await flush();

    scheduler.reset();
    go("a", request(0));
    clock.advance(DEBOUNCE_MS);
    await flush();
    expect(calls).toHaveLength(2);
  });
});

describe("reopening a draft", () => {
  const MANILA = { lat: 14.5995, lng: 120.9842 };
  const ANGELES = { lat: 15.145, lng: 120.5887 };
  const BAGUIO = { lat: 16.4023, lng: 120.596 };
  const LA_UNION = { lat: 16.6159, lng: 120.3209 };

  const first: PairInput = { id: "o>w", from: MANILA, to: ANGELES };
  const second: PairInput = { id: "w>x", from: ANGELES, to: BAGUIO };
  const third: PairInput = { id: "x>d", from: BAGUIO, to: LA_UNION };

  /** The builder's loop: a reducer, with `driveRouting` after every state change, as the hook does. */
  function openBuilder(seed: readonly SeedPair[]) {
    let state: PairRoutingState = createPairRoutingState(seed);
    const tracked = new Map<string, number>();
    let dirty = false;
    const dispatch = (action: PairRoutingAction) => {
      state = pairRoutingReducer(state, action);
      dirty = true;
    };
    const drive = () => {
      while (dirty) {
        dirty = false;
        driveRouting(state, tracked, scheduler, dispatch);
      }
    };
    return {
      get state() {
        return state;
      },
      show(pairs: readonly PairInput[]) {
        dispatch({ type: "sync", pairs });
        drive();
      },
      async settle() {
        await flush();
        drive();
      },
    };
  }

  const requestedPairs = () => calls.map((c) => [c.request.points[0], c.request.points[1]]);

  it("retries only the pairs saved as null and keeps the stored paths", async () => {
    const builder = openBuilder([
      { ...first, path: PATH_A },
      { ...second, path: null },
      { ...third, path: PATH_B },
    ]);
    builder.show([first, second, third]);
    expect(pairView(builder.state, first).phase).toBe("ok");
    expect(pairView(builder.state, second).phase).toBe("routing");

    clock.advance(DEBOUNCE_MS);
    await builder.settle();
    expect(requestedPairs()).toEqual([[ANGELES, BAGUIO]]);
    expect(calls[0]?.request).toMatchObject({ profile: "car", expressways: true });

    calls[0]?.reply(route(PATH_C));
    await builder.settle();
    expect(savedPaths(builder.state, [first, second, third])).toEqual([PATH_A, PATH_C, PATH_B]);
    expect(calls).toHaveLength(1);
  });

  it("marks a retried pair failed on a busy reply, without retrying, and keeps the other paths", async () => {
    const builder = openBuilder([
      { ...first, path: PATH_A },
      { ...second, path: null },
    ]);
    builder.show([first, second]);
    clock.advance(DEBOUNCE_MS);
    await builder.settle();
    calls[0]?.reply({ error: "Busy", code: "busy" }, 429);
    await builder.settle();

    expect(pairView(builder.state, second).phase).toBe("failed");
    expect(savedPaths(builder.state, [first, second])).toEqual([PATH_A, null]);
    clock.advance(10 * 60_000);
    await builder.settle();
    expect(calls).toHaveLength(1);
  });

  it("makes no request for a draft whose pairs all have paths", async () => {
    const builder = openBuilder([
      { ...first, path: PATH_A },
      { ...second, path: PATH_B },
    ]);
    builder.show([first, second]);
    clock.advance(DEBOUNCE_MS);
    await builder.settle();
    expect(calls).toHaveLength(0);
  });

  it("retries nothing, and routes nothing later, once routing turns out to be unavailable", async () => {
    const builder = openBuilder([
      { ...first, path: null },
      { ...second, path: null },
    ]);
    builder.show([first, second]);
    clock.advance(DEBOUNCE_MS);
    await builder.settle();
    expect(calls).toHaveLength(2);

    calls[0]?.reply({ error: "Routing is off", code: "unavailable" }, 503);
    await builder.settle();
    expect(pairView(builder.state, first).phase).toBe("idle");
    expect(pairView(builder.state, second).phase).toBe("idle");

    // The author keeps editing: a moved pin, a new pair.
    const moved: PairInput = { ...second, to: LA_UNION };
    builder.show([first, moved, third]);
    clock.advance(60_000);
    await builder.settle();
    expect(calls).toHaveLength(2);
    expect(savedPaths(builder.state, [first, moved, third])).toEqual([null, null, null]);
  });

  it("applies a cached result to a retried pair without a request", async () => {
    await routed("earlier", { points: [ANGELES, BAGUIO], profile: "car", expressways: true }, PATH_C);
    expect(calls).toHaveLength(1);

    const builder = openBuilder([{ ...second, path: null }]);
    builder.show([second]);
    await builder.settle();
    expect(savedPaths(builder.state, [second])).toEqual([PATH_C]);
    expect(calls).toHaveLength(1);
  });
});

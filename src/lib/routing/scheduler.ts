/**
 * Route scheduler: how a builder session talks to `POST /api/route` without
 * outrunning the endpoint however fast the author edits. Framework-free, so
 * Node tests drive it with a fake clock and a fake `route` function; a builder
 * makes one per session and drops it when the builder closes (the cache goes
 * with it).
 *
 * Jobs are keyed by an opaque string: a post map's pin pair today, a guide's
 * leg next. Each key has at most one live job, the latest one.
 *  - Debounce: a job waits 300 ms before it asks for a slot; scheduling the
 *    same key again inside the window replaces it, so quick successive changes
 *    make one request. `hold` pauses that wait while a pin or via is being
 *    dragged and `release` restarts it, so a drag never makes a request.
 *  - Latest wins: scheduling a key aborts its running request and drops its
 *    queued one; a superseded job never calls back.
 *  - Cache: up to 100 `ok` results, least recently used evicted first, keyed by
 *    profile, expressways, and the exact point list. A hit answers with no
 *    request.
 *  - Concurrency: at most 4 requests run; the rest queue first in, first out.
 *  - Failures (a busy 429, a timed-out 504, a network error) are passed on as
 *    they are and never retried.
 *  - Unavailable: the first `unavailable` reply means no router is configured.
 *    Every other live job is aborted and answered `unavailable`, and the rest
 *    of the session makes no more requests.
 */
import type { RouteRequest } from "@/lib/schemas/route";
import type { RouteOutcome } from "./client";

/** Quiet time a job waits for further changes to its key before it requests. */
export const DEBOUNCE_MS = 300;
export const MAX_IN_FLIGHT = 4;
export const CACHE_LIMIT = 100;

/** What a job's callback hears: everything the client reports except a cancelled request. */
export type RouteResult = Exclude<RouteOutcome, { status: "aborted" }>;

/** The clock the scheduler waits on; tests pass a fake. */
export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const BROWSER_TIMERS: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as number),
};

export interface RouteSchedulerOptions {
  /** Makes one request; `fetchRoute` in the browser. Must resolve `aborted` once `signal` aborts. */
  route: (request: RouteRequest, signal: AbortSignal) => Promise<RouteOutcome>;
  timers?: Timers;
}

export interface RouteScheduler {
  /**
   * Routes `request` for `key`, replacing any earlier job for the key.
   * `onResult` is called once, and only if this is still the key's latest job
   * when it finishes. A cache hit and a known-unavailable router answer at
   * once, before `schedule` returns.
   */
  schedule(key: string, request: RouteRequest, onResult: (result: RouteResult) => void): void;
  /** A drag on `key` began: its job makes no request until `release`. */
  hold(key: string): void;
  /** The drag ended: the job's debounce wait starts again. */
  release(key: string): void;
  /** Drops the key's job (aborting its request) without calling back. */
  cancel(key: string): void;
  /** The builder closed: drops every job, hold, and cached result, and forgets `unavailable`. */
  reset(): void;
}

/** The cache key: profile, expressways, and the exact point list. */
export function routeCacheKey(request: RouteRequest): string {
  return JSON.stringify([request.profile, request.expressways ?? null, request.points.map((p) => [p.lat, p.lng])]);
}

interface Job {
  key: string;
  request: RouteRequest;
  cacheKey: string;
  onResult: (result: RouteResult) => void;
  /** `waiting`: debouncing (or held); `queued`: waiting for a slot; `running`: request in flight. */
  phase: "waiting" | "queued" | "running";
  timer?: unknown;
  controller?: AbortController;
}

export function createRouteScheduler({ route, timers = BROWSER_TIMERS }: RouteSchedulerOptions): RouteScheduler {
  /** The live job of each key. */
  const jobs = new Map<string, Job>();
  /** Jobs waiting for a slot, oldest first; superseded ones are skipped when their turn comes. */
  const queue: Job[] = [];
  const held = new Set<string>();
  /** Insertion order is recency: the first entry is the least recently used. */
  const cache = new Map<string, RouteResult & { status: "ok" }>();
  let running = 0;
  let unavailable = false;

  const isLive = (job: Job) => jobs.get(job.key) === job;

  function cached(job: Job): (RouteResult & { status: "ok" }) | undefined {
    const hit = cache.get(job.cacheKey);
    if (hit) {
      cache.delete(job.cacheKey);
      cache.set(job.cacheKey, hit);
    }
    return hit;
  }

  function remember(job: Job, result: RouteResult & { status: "ok" }) {
    cache.delete(job.cacheKey);
    cache.set(job.cacheKey, result);
    if (cache.size > CACHE_LIMIT) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
  }

  /** Removes the key's job and frees whatever it holds; a running request is aborted. */
  function drop(key: string) {
    const job = jobs.get(key);
    if (!job) return;
    jobs.delete(key);
    if (job.timer !== undefined) timers.clearTimeout(job.timer);
    job.timer = undefined;
    if (job.phase === "running") {
      running -= 1;
      job.controller?.abort();
    }
  }

  function pump() {
    while (running < MAX_IN_FLIGHT) {
      const job = queue.shift();
      if (!job) return;
      if (isLive(job)) void start(job);
    }
  }

  async function start(job: Job) {
    const controller = new AbortController();
    job.phase = "running";
    job.controller = controller;
    running += 1;

    let outcome: RouteOutcome;
    try {
      outcome = await route(job.request, controller.signal);
    } catch {
      outcome = { status: "failed", code: "network", message: "Couldn't reach the routing service" };
    }

    // Superseded or cancelled while it ran: its slot was freed when it was dropped.
    if (!isLive(job) || outcome.status === "aborted") return;

    jobs.delete(job.key);
    running -= 1;
    if (outcome.status === "ok") remember(job, outcome);
    if (outcome.status === "unavailable") {
      unavailable = true;
      const others = [...jobs.values()];
      for (const other of others) drop(other.key);
      job.onResult(outcome);
      for (const other of others) other.onResult({ status: "unavailable" });
    } else {
      job.onResult(outcome);
    }
    pump();
  }

  /** The debounce is over: answer from the cache or join the queue. */
  function enqueue(job: Job) {
    job.timer = undefined;
    if (!isLive(job)) return;
    const hit = cached(job);
    if (hit) {
      jobs.delete(job.key);
      job.onResult(hit);
      return;
    }
    job.phase = "queued";
    queue.push(job);
    pump();
  }

  function wait(job: Job) {
    job.timer = timers.setTimeout(() => enqueue(job), DEBOUNCE_MS);
  }

  return {
    schedule(key, request, onResult) {
      drop(key);
      if (unavailable) {
        onResult({ status: "unavailable" });
        pump();
        return;
      }
      const job: Job = { key, request, cacheKey: routeCacheKey(request), onResult, phase: "waiting" };
      const hit = cached(job);
      if (hit) {
        onResult(hit);
        pump();
        return;
      }
      jobs.set(key, job);
      if (!held.has(key)) wait(job);
      pump();
    },

    hold(key) {
      held.add(key);
      const job = jobs.get(key);
      if (job?.phase === "waiting" && job.timer !== undefined) {
        timers.clearTimeout(job.timer);
        job.timer = undefined;
      }
    },

    release(key) {
      held.delete(key);
      const job = jobs.get(key);
      if (job?.phase === "waiting" && job.timer === undefined) wait(job);
    },

    cancel(key) {
      drop(key);
      pump();
    },

    reset() {
      for (const key of [...jobs.keys()]) drop(key);
      queue.length = 0;
      held.clear();
      cache.clear();
      unavailable = false;
    },
  };
}

/**
 * Nominatim client — server-only. Never import this file in browser code.
 *
 * `createNominatimClient` owns everything Nominatim's usage policy and our
 * server functions need: one-at-a-time upstream calls at least 1 s apart, a
 * bounded wait queue, a total time budget per call, retries for transient
 * failures, and an LRU cache. Its clock, sleep, and fetch are injected so the
 * behavior is testable with a fake clock.
 *
 * Both geocode routes share the module-level `nominatim` instance, so forward
 * and reverse bursts stay within 1 request/second together. Each serverless
 * instance has its own queue and cache (ADR 0003).
 */

import { z } from "zod";
import { geocoderUserAgent } from "@/lib/env";

/** Upstream calls start at least this far apart (Nominatim: 1 request/second). */
const MIN_INTERVAL_MS = 1000;
/** Callers allowed to wait for the upstream slot; one more is rejected as busy. */
const MAX_WAITING = 4;
/** Total time per call: queue wait, spacing, attempts, and backoff. */
const BUDGET_MS = 8000;
/** One upstream attempt; the remaining budget can cut it shorter. */
const ATTEMPT_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3;
/** Exponential: 500 ms, then 1000 ms. */
const BACKOFF_MS = 500;
const CACHE_MAX = 200;
const CACHE_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Upstream shapes (jsonv2 with addressdetails=1)
// ---------------------------------------------------------------------------

const nominatimPlaceSchema = z.object({
  lat: z.coerce.number(),
  lon: z.coerce.number(),
  name: z.string().nullish(),
  display_name: z.string().optional(),
  category: z.string().optional(),
  type: z.string().optional(),
  importance: z.number().optional().catch(undefined),
  address: z.record(z.string(), z.string()).optional(),
});

export type NominatimPlace = z.infer<typeof nominatimPlaceSchema>;

const searchResponseSchema = z.array(nominatimPlaceSchema);

/** Reverse answers `{ "error": "Unable to geocode" }` where there is no place (e.g. open sea). */
const reverseResponseSchema = z.union([
  z.object({ error: z.string() }),
  nominatimPlaceSchema,
]);

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Too many callers are already waiting for the upstream slot. */
export class BusyError extends Error {
  constructor() {
    super("Nominatim queue is full");
    this.name = "BusyError";
  }
}

/** The call's total time budget ran out (queue wait, attempts, and retries). */
export class GeocodeTimeoutError extends Error {
  constructor() {
    super(`Nominatim did not answer within ${BUDGET_MS} ms`);
    this.name = "GeocodeTimeoutError";
  }
}

/** Nominatim failed: an HTTP error, an unreachable server, or an unexpected body. */
export class UpstreamError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "UpstreamError";
    this.status = status;
  }
}

/** One attempt ran past its own timeout; retried while budget remains. */
class AttemptTimeoutError extends Error {
  constructor() {
    super("Nominatim attempt timed out");
    this.name = "AttemptTimeoutError";
  }
}

// ---------------------------------------------------------------------------
// What the geocode routes answer
// ---------------------------------------------------------------------------

/** `Cache-Control` values shared by both geocode routes. */
export const GEOCODE_CACHE_CONTROL = {
  /** 200: browsers 5 min, CDN a day, then serve stale while revalidating. */
  found: "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400",
  /** Reverse 404 "no place here": cacheable, but not for long. */
  notFound: "public, max-age=300, s-maxage=300",
  /** Validation and upstream failures. */
  error: "no-store",
} as const;

/** Status and rider message for a failed client call. */
export function geocodeFailure(err: unknown): { status: 502 | 503 | 504; error: string } {
  if (err instanceof BusyError) {
    return { status: 503, error: "Place search is busy right now. Try again in a moment." };
  }
  if (err instanceof GeocodeTimeoutError) {
    return { status: 504, error: "Place search took too long. Try again." };
  }
  return { status: 502, error: "Place search isn't working right now. Try again later." };
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export interface NominatimClientDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Milliseconds since the epoch (or any monotonic origin). */
  now: () => number;
  /** Resolves after `ms`, or as soon as `signal` aborts. Never rejects. */
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** A fixed agent, or a resolver called per upstream request (lets builds skip env validation). */
  userAgent: string | (() => string);
  baseUrl?: string;
}

export interface NominatimClient {
  /** Forward search, Philippines only. */
  search(params: { q: string; limit: number }): Promise<NominatimPlace[]>;
  /** Reverse lookup at 4-decimal precision; `null` when there is no place there. */
  reverse(params: { lat: number; lon: number }): Promise<NominatimPlace | null>;
}

export function createNominatimClient(deps: NominatimClientDeps): NominatimClient {
  const { now, sleep, userAgent } = deps;
  const baseUrl = deps.baseUrl ?? "https://nominatim.openstreetmap.org";

  // --- LRU cache of validated upstream JSON (Map keeps insertion order) ---
  const cache = new Map<string, { json: unknown; expires: number }>();

  function cacheGet(key: string): { json: unknown } | undefined {
    const entry = cache.get(key);
    if (!entry) return undefined;
    cache.delete(key);
    if (entry.expires <= now()) return undefined;
    cache.set(key, entry); // most recently used moves to the end
    return entry;
  }

  function cacheSet(key: string, json: unknown): void {
    cache.delete(key);
    cache.set(key, { json, expires: now() + CACHE_TTL_MS });
    for (const oldest of cache.keys()) {
      if (cache.size <= CACHE_MAX) break;
      cache.delete(oldest);
    }
  }

  // --- The upstream slot: one holder, a bounded FIFO of waiters ---
  let held = false;
  const waiters: Array<() => void> = [];
  let lastStart = Number.NEGATIVE_INFINITY;

  /** Take the slot, or wait in line for it; leaves the line when `signal` aborts. */
  function acquire(signal: AbortSignal): Promise<void> {
    if (!held) {
      held = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const grant = () => {
        signal.removeEventListener("abort", leave);
        resolve();
      };
      const leave = () => {
        const index = waiters.indexOf(grant);
        if (index >= 0) waiters.splice(index, 1);
        reject(signal.reason);
      };
      waiters.push(grant);
      signal.addEventListener("abort", leave, { once: true });
    });
  }

  /** Hand the slot to the next waiter, or free it. */
  function release(): void {
    const next = waiters.shift();
    if (next) next();
    else held = false;
  }

  async function attemptOnce(url: string, userAgent: string, callSignal: AbortSignal, deadline: number): Promise<unknown> {
    const attempt = new AbortController();
    const finished = new AbortController();
    const forwardAbort = () => attempt.abort(callSignal.reason);
    callSignal.addEventListener("abort", forwardAbort, { once: true });
    void sleep(Math.min(ATTEMPT_TIMEOUT_MS, deadline - now()), finished.signal).then(() => {
      if (!finished.signal.aborted) attempt.abort(new AttemptTimeoutError());
    });
    try {
      const res = await deps.fetch(url, {
        headers: { "User-Agent": userAgent, "Accept-Language": "en-PH,en" },
        signal: attempt.signal,
      });
      if (!res.ok) {
        throw new UpstreamError(`Nominatim returned HTTP ${res.status}`, res.status);
      }
      return await res.json();
    } finally {
      finished.abort();
      callSignal.removeEventListener("abort", forwardAbort);
    }
  }

  /** Run attempts while holding the slot; every attempt starts ≥ MIN_INTERVAL_MS after the last. */
  async function fetchWithRetry(url: string, signal: AbortSignal, deadline: number): Promise<unknown> {
    let agent: string;
    try {
      agent = typeof userAgent === "function" ? userAgent() : userAgent;
    } catch (err) {
      // Misconfigured env: not retryable; routes answer with their 502.
      throw new UpstreamError("Geocoder user agent is not configured", undefined, { cause: err });
    }
    for (let attempt = 1; ; attempt++) {
      const wait = lastStart + MIN_INTERVAL_MS - now();
      if (wait > 0) await sleep(wait, signal);
      signal.throwIfAborted();
      // Its budget can run out the instant the slot is handed over.
      if (now() >= deadline) throw new GeocodeTimeoutError();
      lastStart = now();
      try {
        return await attemptOnce(url, agent, signal, deadline);
      } catch (err) {
        signal.throwIfAborted();
        const backoff = BACKOFF_MS * 2 ** (attempt - 1);
        if (attempt >= MAX_ATTEMPTS || !isRetryable(err) || now() + backoff >= deadline) {
          throw finalError(err);
        }
        await sleep(backoff, signal);
      }
    }
  }

  async function lookup<T>(
    key: string,
    path: "search" | "reverse",
    params: Record<string, string>,
    parse: (json: unknown) => T,
  ): Promise<T> {
    const hit = cacheGet(key);
    if (hit) return parse(hit.json);
    if (held && waiters.length >= MAX_WAITING) throw new BusyError();

    const deadline = now() + BUDGET_MS;
    const call = new AbortController();
    const settled = new AbortController();
    void sleep(BUDGET_MS, settled.signal).then(() => {
      if (!settled.signal.aborted) call.abort(new GeocodeTimeoutError());
    });

    const url = new URL(`${baseUrl}/${path}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

    let acquired = false;
    try {
      await acquire(call.signal);
      acquired = true;
      // A caller ahead in the queue may have fetched the same key.
      const fresh = cacheGet(key);
      if (fresh) return parse(fresh.json);

      const json = await fetchWithRetry(url.toString(), call.signal, deadline);
      let value: T;
      try {
        value = parse(json);
      } catch (err) {
        throw new UpstreamError("Nominatim returned an unexpected response", undefined, { cause: err });
      }
      cacheSet(key, json);
      return value;
    } finally {
      if (acquired) release();
      settled.abort();
    }
  }

  return {
    search({ q, limit }) {
      return lookup(
        `search:${limit}:${q.toLowerCase()}`,
        "search",
        { format: "jsonv2", q, limit: String(limit), countrycodes: "ph", addressdetails: "1" },
        (json) => searchResponseSchema.parse(json),
      );
    },
    reverse({ lat, lon }) {
      // ~11 m: taps this close share one cache entry and one upstream answer.
      const la = lat.toFixed(4);
      const lo = lon.toFixed(4);
      return lookup(
        `reverse:${la}:${lo}`,
        "reverse",
        { format: "jsonv2", lat: la, lon: lo, addressdetails: "1" },
        (json) => {
          const answer = reverseResponseSchema.parse(json);
          return "error" in answer ? null : answer;
        },
      );
    },
  };
}

/** Network failures, attempt timeouts, and 5xx answers may heal on retry; nothing else will. */
function isRetryable(err: unknown): boolean {
  if (err instanceof UpstreamError) return err.status !== undefined && err.status >= 500;
  if (err instanceof SyntaxError) return false; // unparseable body
  return true; // fetch rejected: unreachable, reset, or our attempt timeout
}

function finalError(err: unknown): Error {
  if (err instanceof UpstreamError) return err;
  if (err instanceof AttemptTimeoutError) return new GeocodeTimeoutError();
  return new UpstreamError("Could not reach Nominatim", undefined, { cause: err });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** The one client both geocode routes share. */
export const nominatim = createNominatimClient({
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  sleep,
  userAgent: geocoderUserAgent,
});

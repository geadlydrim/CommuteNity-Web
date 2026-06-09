/**
 * Shared Nominatim HTTP helper — server-only.
 * Never import this file in browser code.
 *
 * Holds the ONE module-level throttle + cache shared by both the forward
 * (/search) and reverse (/reverse) geocode routes so combined bursts
 * (e.g. geocode search then immediate drop-pin reverse) stay within
 * Nominatim's 1 req/s rate limit.
 *
 * Serverless caveat: each cold-start instance gets its own lastRequestAt.
 * Acceptable for MVP at low traffic. Under load, swap to Upstash/Vercel KV.
 */

const CACHE_MAX = 200;
const CACHE_TTL_MS = 300_000; // 5 min

let lastRequestAt = 0;
const cache = new Map<string, { data: unknown; expires: number }>();

/** Return cached data if still fresh, else undefined. */
export function cacheGet(key: string): unknown | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.data;
}

/** Store data in cache with FIFO eviction when full. */
export function cacheSet(key: string, data: unknown): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
}

/**
 * Fire a Nominatim request, respecting the shared 1 req/s throttle.
 * Returns parsed JSON or throws an Error (with a `.status` property on
 * upstream HTTP failures; `TimeoutError` name on timeout).
 */
export async function fetchNominatim(
  path: "search" | "reverse",
  params: Record<string, string>
): Promise<unknown> {
  const url = new URL(`https://nominatim.openstreetmap.org/${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const wait = 1000 - (Date.now() - lastRequestAt);
  if (wait > 0) {
    await new Promise<void>((r) => setTimeout(r, wait));
  }
  lastRequestAt = Date.now();

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": process.env.GEOCODER_USER_AGENT ?? "CommuteNity/0.1 (dev)",
      "Accept-Language": "en-PH,en",
    },
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const err = Object.assign(
      new Error(`Nominatim ${path} returned HTTP ${res.status}`),
      { status: res.status }
    );
    throw err;
  }

  return res.json();
}

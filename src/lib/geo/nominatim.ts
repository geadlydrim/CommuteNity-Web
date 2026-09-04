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

// Retry config — only for transient network / timeout failures
const MAX_ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 8000; // up from 5000 — more room on slow networks
const RETRY_BACKOFF_MS = 600;    // linear: 600 ms, 1200 ms between retries

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

// ---------------------------------------------------------------------------
// Two-tier PH-aware label builder
// ---------------------------------------------------------------------------

export interface LabelParts {
  /** Landmark / POI name — primary bold line. */
  primary: string;
  /** Full address minus postcode/country — shown in search dropdown grey sub-line. */
  detail: string;
  /** Simplified barangay, city, province — stored as pin sublabel. */
  secondary: string;
  /** Raw Nominatim display_name — tooltip / fallback. */
  full: string;
}

// Address keys to walk in order for the detail line (postcode/country excluded).
const DETAIL_KEY_ORDER = [
  "road",
  "quarter", "neighbourhood", "suburb", "village", "hamlet",
  "city_district", "district",
  "city", "town", "municipality",
  "county", "province", "state",
] as const;

/**
 * Derive Google-Maps-style label parts from a Nominatim result object.
 *
 * `raw` must be a single Nominatim feature (from `/search` array items or the
 * `/reverse` root object). Requires `addressdetails=1` in the upstream call.
 *
 * Two secondary strings are produced:
 *   detail    — full address chain, no postcode/country (for search dropdown)
 *   secondary — simplified barangay, city, province (stored as pin sublabel)
 */
export function buildLabelParts(raw: Record<string, unknown>): LabelParts {
  const a = ((raw.address ?? {}) as Record<string, string>);
  const name = typeof raw.name === "string" ? raw.name.trim() : "";

  const rawPoi =
    name || a.amenity || a.shop || a.tourism || a.leisure ||
    a.historic || a.office || a.building;
  const rawRoad = a.road;
  const rawBarangay =
    a.quarter || a.neighbourhood || a.suburb ||
    a.city_district || a.village || a.hamlet;
  const rawCity = a.city || a.town || a.municipality;
  const rawProvince = a.province || a.state;

  // Primary: prefer landmark → road → barangay → city
  const primaryVal =
    rawPoi || rawRoad || rawBarangay || rawCity || "";

  // Detail: all address keys in order, skipping the value already used as primary
  const primaryLower = primaryVal.toLowerCase();
  const detailSeen = new Set<string>([primaryLower].filter(Boolean));
  const detailParts: string[] = [];
  for (const key of DETAIL_KEY_ORDER) {
    const v = a[key];
    if (v && !detailSeen.has(v.toLowerCase())) {
      detailSeen.add(v.toLowerCase());
      detailParts.push(v);
    }
  }

  // Secondary (simplified): barangay → city → province, de-duped against primary
  const secondarySeen = new Set<string>([primaryLower].filter(Boolean));
  const secondaryParts = ([rawBarangay, rawCity, rawProvince] as (string | undefined)[])
    .filter((v): v is string => {
      if (!v || secondarySeen.has(v.toLowerCase())) return false;
      secondarySeen.add(v.toLowerCase());
      return true;
    });

  const full = typeof raw.display_name === "string" ? raw.display_name : "";
  const primary = primaryVal || full;
  return {
    primary,
    detail: detailParts.join(", "),
    secondary: secondaryParts.join(", "),
    full,
  };
}

/**
 * Returns true for transient connection/timeout errors that are worth retrying.
 * HTTP errors (carry `.status`) are never retried — they won't self-heal.
 */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if ("status" in err) return false; // upstream HTTP error — don't retry
  if (err.name === "TimeoutError" || err.name === "AbortError") return true;
  // ETIMEDOUT from undici surfaces as TypeError: fetch failed, cause has `code`
  const code =
    (err as { cause?: { code?: string } }).cause?.code ??
    (err as { code?: string }).code;
  return (
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "EAI_AGAIN" ||
    err.message.includes("fetch failed") // generic undici rejection
  );
}

/**
 * Fire a Nominatim request, respecting the shared 1 req/s throttle.
 * Retries up to MAX_ATTEMPTS times on timeout / connection failures.
 * Returns parsed JSON or throws an Error (with a `.status` property on
 * upstream HTTP failures; `TimeoutError` name on final timeout).
 */
export async function fetchNominatim(
  path: "search" | "reverse",
  params: Record<string, string>
): Promise<unknown> {
  const url = new URL(`https://nominatim.openstreetmap.org/${path}`);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  let lastErr: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Re-apply throttle inside the loop so retries also respect 1 req/s
    const wait = 1000 - (Date.now() - lastRequestAt);
    if (wait > 0) {
      await new Promise<void>((r) => setTimeout(r, wait));
    }
    lastRequestAt = Date.now();

    try {
      const res = await fetch(url.toString(), {
        headers: {
          "User-Agent":
            process.env.GEOCODER_USER_AGENT ?? "CommuteNity/0.1 (dev)",
          "Accept-Language": "en-PH,en",
        },
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });

      if (!res.ok) {
        // HTTP error — not retried; keep .status so routes can map to 504/502
        throw Object.assign(
          new Error(`Nominatim ${path} returned HTTP ${res.status}`),
          { status: res.status }
        );
      }

      return res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS && isRetryable(err)) {
        console.warn(
          `[Geocode] attempt ${attempt} failed (${err instanceof Error ? err.message : err}); retrying in ${RETRY_BACKOFF_MS * attempt}ms`
        );
        await new Promise<void>((r) =>
          setTimeout(r, RETRY_BACKOFF_MS * attempt)
        );
        continue;
      }
      // Final attempt exhausted, or non-retryable — preserve original shape
      throw err;
    }
  }

  // Unreachable; satisfies TS control-flow
  throw lastErr;
}

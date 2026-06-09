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

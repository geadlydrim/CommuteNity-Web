export type { GeocodeResult } from "./types";

/**
 * Forward geocode a text query via the app's /api/geocode proxy (Nominatim).
 * Safe to use in browser code (TanStack Query queryFn, form handlers, etc.).
 *
 * @param query - Human-readable search string (min 2 chars).
 * @param opts.limit - Max results (1–10, default 5).
 * @param opts.signal - AbortSignal forwarded to the fetch (for React Query / unmount cancellation).
 */
export async function geocode(
  query: string,
  opts?: { limit?: number; signal?: AbortSignal }
): Promise<import("./types").GeocodeResult[]> {
  const params = new URLSearchParams({ q: query });
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));

  const res = await fetch(`/api/geocode?${params.toString()}`, {
    signal: opts?.signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Geocode failed (${res.status})`
    );
  }

  return res.json();
}

/**
 * Reverse geocode (lat, lon) → a human-readable place name.
 * Proxied through /api/geocode/reverse (shares the same Nominatim throttle
 * as forward geocoding).
 *
 * @param lat - Latitude (WGS-84).
 * @param lon - Longitude (WGS-84).
 * @param opts.signal - AbortSignal for cancellation.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
  opts?: { signal?: AbortSignal }
): Promise<{ displayName: string; secondaryName?: string; fullName?: string; lat: number; lon: number }> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
  });

  const res = await fetch(`/api/geocode/reverse?${params.toString()}`, {
    signal: opts?.signal,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Reverse geocode failed (${res.status})`
    );
  }

  return res.json();
}

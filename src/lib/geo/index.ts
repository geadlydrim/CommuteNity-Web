import type { z } from "zod";
import {
  geocodeErrorSchema,
  geocodeResultListSchema,
  reverseGeocodeResultSchema,
} from "@/lib/schemas/geocode";
import type { GeocodeResult, ReverseGeocodeResult } from "./types";

export type { GeocodeResult, ReverseGeocodeResult } from "./types";

/** The geocode routes answered 503: too many lookups are queued. Retry shortly. */
export class GeocodeBusyError extends Error {
  constructor() {
    super("Place search is busy right now. Try again in a moment.");
    this.name = "GeocodeBusyError";
  }
}

/** GET a geocode route and parse its 200 body; non-2xx becomes an Error carrying the route's message. */
async function getGeocode<S extends z.ZodType>(
  url: string,
  schema: S,
  failure: string,
  signal: AbortSignal | undefined,
): Promise<z.output<S>> {
  const res = await fetch(url, { signal });

  if (res.status === 503) throw new GeocodeBusyError();
  if (!res.ok) {
    const body = geocodeErrorSchema.safeParse(await res.json().catch(() => null));
    throw new Error(body.success ? body.data.error : `${failure} (${res.status})`);
  }

  const parsed = schema.safeParse(await res.json());
  if (!parsed.success) throw new Error(`${failure}: unexpected response`);
  return parsed.data;
}

/**
 * Forward geocode a text query via the app's /api/geocode proxy (Nominatim).
 * Safe to use in browser code (data-fetching hooks, form handlers, etc.).
 * Throws `GeocodeBusyError` when the server's lookup queue is full.
 *
 * @param query - Human-readable search string (min 2 chars).
 * @param opts.limit - Max results (1–10, default 5).
 * @param opts.signal - AbortSignal forwarded to the fetch (for unmount cancellation).
 */
export function geocode(
  query: string,
  opts?: { limit?: number; signal?: AbortSignal }
): Promise<GeocodeResult[]> {
  const params = new URLSearchParams({ q: query });
  if (opts?.limit !== undefined) params.set("limit", String(opts.limit));
  return getGeocode(
    `/api/geocode?${params.toString()}`,
    geocodeResultListSchema,
    "Geocode failed",
    opts?.signal,
  );
}

/**
 * Reverse geocode (lat, lon) → a human-readable place name.
 * Proxied through /api/geocode/reverse (shares the same Nominatim queue
 * as forward geocoding). Throws `GeocodeBusyError` when that queue is full.
 *
 * @param lat - Latitude (WGS-84).
 * @param lon - Longitude (WGS-84).
 * @param opts.signal - AbortSignal for cancellation.
 */
export function reverseGeocode(
  lat: number,
  lon: number,
  opts?: { signal?: AbortSignal }
): Promise<ReverseGeocodeResult> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
  });
  return getGeocode(
    `/api/geocode/reverse?${params.toString()}`,
    reverseGeocodeResultSchema,
    "Reverse geocode failed",
    opts?.signal,
  );
}

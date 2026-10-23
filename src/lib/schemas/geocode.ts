import { z } from "zod";
import { PH_LAT_RANGE, PH_LNG_RANGE } from "./post-map";

export const geocodeQuerySchema = z
  .string()
  .trim()
  .min(2, "Query must be at least 2 characters")
  .max(120, "Query must be 120 characters or less");

const LIMIT_MESSAGE = "Limit must be a whole number from 1 to 10";

export const limitSchema = z.coerce
  .number({ error: LIMIT_MESSAGE })
  .int(LIMIT_MESSAGE)
  .min(1, LIMIT_MESSAGE)
  .max(10, LIMIT_MESSAGE)
  .default(5);

/** Reverse-geocode coordinates: required (blank is not 0) and inside the
 *  same Philippine bounds as pins (post-map.ts). */
const coordinate = (axis: string, range: { min: number; max: number }) =>
  z
    .string({ error: `${axis} is required` })
    .trim()
    .min(1, `${axis} is required`)
    .pipe(
      z.coerce
        .number<string>()
        .min(range.min, `${axis} must be inside the Philippines`)
        .max(range.max, `${axis} must be inside the Philippines`),
    );

export const latSchema = coordinate("Latitude", PH_LAT_RANGE);
export const lonSchema = coordinate("Longitude", PH_LNG_RANGE);

// ---------------------------------------------------------------------------
// Responses: what /api/geocode and /api/geocode/reverse return. The routes
// build these shapes and the browser client (`@/lib/geo`) parses them.
// ---------------------------------------------------------------------------

const placeLabelFields = {
  /** Primary display name — landmark / POI, else road, barangay, or city. */
  displayName: z.string(),
  /** Full address minus postcode/country — grey sub-line in the search dropdown. */
  detailName: z.string().optional(),
  /** Simplified address — barangay, city, province — stored as pin sublabel. */
  secondaryName: z.string().optional(),
  /** Raw Nominatim display_name (tooltip / fallback). */
  fullName: z.string().optional(),
  lat: z.number(),
  lon: z.number(),
};

/** One forward-geocode (search) result. */
export const geocodeResultSchema = z.object({
  ...placeLabelFields,
  /** Nominatim place type, e.g. "bus_station". */
  type: z.string().optional(),
  /** Nominatim category, e.g. "amenity". */
  category: z.string().optional(),
  importance: z.number().optional(),
});

/** `/api/geocode` 200 body. */
export const geocodeResultListSchema = z.array(geocodeResultSchema);

/** `/api/geocode/reverse` 200 body. */
export const reverseGeocodeResultSchema = z.object(placeLabelFields);

/** Error body of both routes. */
export const geocodeErrorSchema = z.object({ error: z.string() });

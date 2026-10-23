import { z } from "zod";
import { PH_LAT_RANGE, PH_LNG_RANGE } from "./post-map";

export const geocodeQuerySchema = z
  .string()
  .trim()
  .min(2, "Query must be at least 2 characters")
  .max(120, "Query must be 120 characters or less");

export const limitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(10)
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

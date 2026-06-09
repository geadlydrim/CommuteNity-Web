import { z } from "zod";

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

/** Loose world-range lat/lon schemas for the reverse geocode API boundary.
 *  PH-specific tightening happens in post-map.ts (pinSchema). */
export const latSchema = z.coerce
  .number()
  .min(-90, "Latitude must be between -90 and 90")
  .max(90, "Latitude must be between -90 and 90");

export const lonSchema = z.coerce
  .number()
  .min(-180, "Longitude must be between -180 and 180")
  .max(180, "Longitude must be between -180 and 180");

import { z } from "zod";

/**
 * Philippines bounding box — used by both the zod schema (validation)
 * and the static-map fit logic (named here so they can't drift apart).
 */
export const PH_LAT_RANGE = { min: 4, max: 21 } as const;
export const PH_LNG_RANGE = { min: 116, max: 127 } as const;

export const pinSchema = z.object({
  /** Latitude (WGS-84). Uses "lng" not "lon" to match react-map-gl vocabulary. */
  lat: z.number().min(PH_LAT_RANGE.min).max(PH_LAT_RANGE.max),
  lng: z.number().min(PH_LNG_RANGE.min).max(PH_LNG_RANGE.max),
  /** Primary display name — landmark / POI (bold line). */
  label: z.string().trim().min(1, "Label is required").max(120),
  /** Secondary display name — barangay, city, province (grey sub-line). */
  sublabel: z.string().trim().max(160).optional(),
});

/**
 * Versioned envelope for the posts.map_data JSONB column.
 *
 * Roles are position-derived, NOT stored:
 *   pins[0]          = origin
 *   pins[last]       = destination
 *   pins[1..last-1]  = waypoints / transfer points
 *
 * Reordering in the builder is a plain array splice — no role bookkeeping.
 * The `version` field allows future shape migrations without a DB migration.
 */
export const mapDataSchema = z.object({
  version: z.literal(1),
  pins: z
    .array(pinSchema)
    .min(2, "At least an origin and destination are required")
    .max(10, "Maximum 10 pins"),
});

export type MapPin = z.infer<typeof pinSchema>;
export type MapData = z.infer<typeof mapDataSchema>;

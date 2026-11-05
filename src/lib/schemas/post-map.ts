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

export type MapPin = z.infer<typeof pinSchema>;

// ---------------------------------------------------------------------------
// Versions (ADR 0004)
//
// A post map is a versioned document in posts.map_data. Readers accept every
// version ever written and migrate it to the current shape; writers always
// write CURRENT_POST_MAP_VERSION. To change the shape, add a version schema to
// `storedPostMapSchema`, point `mapDataSchema` at it, and add a migrate case.
// ---------------------------------------------------------------------------

export const CURRENT_POST_MAP_VERSION = 2;

/**
 * A street path in the document: a Google encoded polyline at precision 5.
 * `null` stands for a straight line (no path found, or a map saved before paths).
 */
export const encodedPathSchema = z.string().min(1);

const pinsSchema = z
  .array(pinSchema)
  .min(2, "At least an origin and destination are required")
  .max(10, "Maximum 10 pins");

/**
 * Version 1. Roles are position-derived, NOT stored:
 *   pins[0]          = origin
 *   pins[last]       = destination
 *   pins[1..last-1]  = waypoints / transfer points
 *
 * Reordering in the builder is a plain array splice — no role bookkeeping.
 */
const postMapV1Schema = z.object({
  version: z.literal(1),
  pins: pinsSchema,
});

/**
 * Version 2: version 1 plus `paths`, one entry per consecutive pin pair
 * (`pins.length - 1`), each an encoded street path or `null` for a straight line.
 */
const postMapV2Schema = z
  .object({
    version: z.literal(2),
    pins: pinsSchema,
    paths: z.array(encodedPathSchema.nullable()),
  })
  .superRefine((doc, ctx) => {
    if (doc.paths.length !== doc.pins.length - 1) {
      ctx.addIssue({
        code: "custom",
        path: ["paths"],
        message: "Each pair of consecutive pins needs exactly one path entry",
      });
    }
  });

/** The current version: what writers validate before saving. */
export const mapDataSchema = postMapV2Schema;
export type MapData = z.infer<typeof mapDataSchema>;

/** Every post-map version ever written. */
const storedPostMapSchema = z.discriminatedUnion("version", [postMapV1Schema, postMapV2Schema]);

function migratePostMap(doc: z.infer<typeof storedPostMapSchema>): MapData {
  switch (doc.version) {
    case 1:
      return {
        version: 2,
        pins: doc.pins,
        paths: doc.pins.slice(1).map(() => null),
      };
    case 2:
      return doc;
  }
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Outcome of reading a stored map document (post map or guide). */
export type MapDocumentParse<T> =
  | { status: "ok"; map: T }
  /** A newer version than this build knows: show it as unavailable, never overwrite it. */
  | { status: "unknown-version"; version: number }
  | { status: "invalid" }
  | { status: "none" };

const versionProbe = z.object({ version: z.number().int() });

/**
 * Classifies a document that failed to parse: an object whose `version` is
 * newer than `newest` is from a later format, anything else is invalid.
 */
export function unparsedMapDocument(raw: unknown, newest: number): MapDocumentParse<never> {
  const probe = versionProbe.safeParse(raw);
  return probe.success && probe.data.version > newest
    ? { status: "unknown-version", version: probe.data.version }
    : { status: "invalid" };
}

/** Reads posts.map_data: `none` for null, otherwise migrated to the current shape. */
export function parsePostMap(raw: unknown): MapDocumentParse<MapData> {
  if (raw === null || raw === undefined) return { status: "none" };
  const parsed = storedPostMapSchema.safeParse(raw);
  return parsed.success
    ? { status: "ok", map: migratePostMap(parsed.data) }
    : unparsedMapDocument(raw, CURRENT_POST_MAP_VERSION);
}

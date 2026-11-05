import { z } from "zod";
import { modeSchema } from "./modes";
import { guideChainStatus } from "./guide-chain";
import { legOptions } from "./leg-options";
import {
  PH_LAT_RANGE,
  PH_LNG_RANGE,
  encodedPathSchema,
  pinSchema,
  unparsedMapDocument,
  type MapDocumentParse,
} from "./post-map";

// ---------------------------------------------------------------------------
// Via — an unnamed point a leg's street path is forced through
// ---------------------------------------------------------------------------

/** Inside the same Philippine bounds as pins; carries no label. */
export const viaSchema = z.object({
  lat: z.number().min(PH_LAT_RANGE.min).max(PH_LAT_RANGE.max),
  lng: z.number().min(PH_LNG_RANGE.min).max(PH_LNG_RANGE.max),
});

export type Via = z.infer<typeof viaSchema>;

export const MAX_VIAS_PER_LEG = 10;

// ---------------------------------------------------------------------------
// Leg — one origin→destination segment with a transport mode
// ---------------------------------------------------------------------------

/** Version 1 leg: ends and mode only (straight line). */
const legV1Schema = z.object({
  id: z.string().min(1),
  mode: modeSchema,
  origin: pinSchema,
  destination: pinSchema,
});

/** Version 2 leg: version 1 plus the street path and what shaped it. */
export const legSchema = legV1Schema.extend({
  /** Ordered points the path is forced through (0–10). */
  vias: z.array(viaSchema).max(MAX_VIAS_PER_LEG, `Maximum ${MAX_VIAS_PER_LEG} vias per leg`),
  /** Whether a car path may use expressways; the mode's default unless the author flipped it. */
  expressways: z.boolean(),
  /** Encoded street path (a rail leg's holds its rail slice), or `null` for a straight line. */
  path: encodedPathSchema.nullable(),
});

export type GuideLeg = z.infer<typeof legSchema>;

// ---------------------------------------------------------------------------
// EndRef — points to one end (origin|destination) of a specific leg
// ---------------------------------------------------------------------------

export const endRefSchema = z.object({
  legId: z.string().min(1),
  end: z.enum(["origin", "destination"]),
});

export type EndRef = z.infer<typeof endRefSchema>;

// ---------------------------------------------------------------------------
// Transfer — joins one leg's destination to another leg's origin
// ---------------------------------------------------------------------------

export const transferSchema = z.object({
  id: z.string().min(1),
  mode: modeSchema,
  /** Alight here — must always be a destination end. */
  from: endRefSchema,
  /** Board here — must always be an origin end. */
  to: endRefSchema,
});

export type GuideTransfer = z.infer<typeof transferSchema>;

// ---------------------------------------------------------------------------
// Versions (ADR 0004)
//
// A guide is a versioned document in comments.map_data. Readers accept every
// version ever written and migrate it to the current shape; writers always
// write CURRENT_GUIDE_VERSION. To change the shape, add a version schema to
// `storedGuideSchema`, point `guideMapDataSchema` at it, and add a migrate case.
// ---------------------------------------------------------------------------

export const CURRENT_GUIDE_VERSION = 2;

const LEGS_MIN = "At least one leg is required";
const LEGS_MAX = "Maximum 8 legs";

/** Version 1: legs joined by transfers into one chain (see guide-chain.ts). */
const guideV1Schema = z
  .object({
    version: z.literal(1),
    /** Discriminates from commuter map_data (which has no 'kind' field). */
    kind: z.literal("guide"),
    legs: z.array(legV1Schema).min(1, LEGS_MIN).max(8, LEGS_MAX),
    // Stored key is `connectors` (v1); the glossary term is transfer.
    connectors: z.array(transferSchema).default([]),
  })
  .superRefine((guide, ctx) => {
    const chain = guideChainStatus(guide.legs, guide.connectors);
    if (!chain.ok) ctx.addIssue({ code: "custom", message: chain.message });
  });

/** Version 2: version 1 with a street path, vias, and expressways choice on every leg. */
const guideV2Schema = z
  .object({
    version: z.literal(2),
    kind: z.literal("guide"),
    legs: z.array(legSchema).min(1, LEGS_MIN).max(8, LEGS_MAX),
    // The stored key stays `connectors`; the glossary term is transfer.
    connectors: z.array(transferSchema).default([]),
  })
  .superRefine((guide, ctx) => {
    const chain = guideChainStatus(guide.legs, guide.connectors);
    if (!chain.ok) ctx.addIssue({ code: "custom", message: chain.message });
  });

/** The current version: what writers validate before saving. */
export const guideMapDataSchema = guideV2Schema;
export type GuideMapData = z.infer<typeof guideMapDataSchema>;

/** Every guide version ever written. */
const storedGuideSchema = z.discriminatedUnion("version", [guideV1Schema, guideV2Schema]);

function migrateGuide(doc: z.infer<typeof storedGuideSchema>): GuideMapData {
  switch (doc.version) {
    case 1:
      return {
        version: 2,
        kind: doc.kind,
        legs: doc.legs.map((leg) => ({
          ...leg,
          vias: [],
          expressways: legOptions(leg.mode).expressways,
          path: null,
        })),
        connectors: doc.connectors,
      };
    case 2:
      return doc;
  }
}

/** Reads comments.map_data: `none` for null, otherwise migrated to the current shape. */
export function parseGuide(raw: unknown): MapDocumentParse<GuideMapData> {
  if (raw === null || raw === undefined) return { status: "none" };
  const parsed = storedGuideSchema.safeParse(raw);
  return parsed.success
    ? { status: "ok", map: migrateGuide(parsed.data) }
    : unparsedMapDocument(raw, CURRENT_GUIDE_VERSION);
}

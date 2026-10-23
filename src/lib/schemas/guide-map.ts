import { z } from "zod";
import { modeSchema } from "./modes";
import { guideChainStatus } from "./guide-chain";
import { pinSchema, unparsedMapDocument, type MapDocumentParse } from "./post-map";

// ---------------------------------------------------------------------------
// Leg — one origin→destination segment with a transport mode
// ---------------------------------------------------------------------------

export const legSchema = z.object({
  id: z.string().min(1),
  mode: modeSchema,
  origin: pinSchema,
  destination: pinSchema,
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
// write CURRENT_GUIDE_VERSION. To change the shape, add a v2 schema to
// `storedGuideSchema`, point `guideMapDataSchema` at it, and add a migrate case.
// ---------------------------------------------------------------------------

export const CURRENT_GUIDE_VERSION = 1;

/** Version 1: legs joined by transfers into one chain (see guide-chain.ts). */
const guideV1Schema = z
  .object({
    version: z.literal(1),
    /** Discriminates from commuter map_data (which has no 'kind' field). */
    kind: z.literal("guide"),
    legs: z.array(legSchema).min(1, "At least one leg is required").max(8, "Maximum 8 legs"),
    // Stored key is `connectors` (v1); the glossary term is transfer.
    connectors: z.array(transferSchema).default([]),
  })
  .superRefine((guide, ctx) => {
    const chain = guideChainStatus(guide.legs, guide.connectors);
    if (!chain.ok) ctx.addIssue({ code: "custom", message: chain.message });
  });

/** The current version: what writers validate before saving. */
export const guideMapDataSchema = guideV1Schema;
export type GuideMapData = z.infer<typeof guideMapDataSchema>;

/** Every guide version ever written. */
const storedGuideSchema = z.discriminatedUnion("version", [guideV1Schema]);

function migrateGuide(doc: z.infer<typeof storedGuideSchema>): GuideMapData {
  switch (doc.version) {
    case 1:
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

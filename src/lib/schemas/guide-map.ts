import { z } from "zod";
import { pinSchema } from "./post-map";

// ---------------------------------------------------------------------------
// Transport modes — mirrors the DB CHECK constraint on stops/routes tables
// (supabase/migrations/20260521150012_initial_schema.sql)
// ---------------------------------------------------------------------------

export const TRANSPORT_MODES = [
  "jeepney", "bus", "mrt", "lrt", "uv_express", "p2p", "tricycle", "walking",
] as const;

export const modeSchema = z.enum(TRANSPORT_MODES);
export type TransportMode = z.infer<typeof modeSchema>;

/** Modes shown in the guide-map builder UI (extend list here when ready). */
export const ENABLED_MODES: TransportMode[] = ["walking", "bus", "jeepney"];

/** Display label + brand color per mode. */
export const MODE_META: Record<TransportMode, { label: string; color: string }> = {
  walking:    { label: "Walk",      color: "#6b7280" }, // gray-500
  bus:        { label: "Bus",       color: "#3b82f6" }, // blue-500
  jeepney:    { label: "Jeep",      color: "#f59e0b" }, // amber-500
  mrt:        { label: "MRT",       color: "#8b5cf6" }, // violet-500
  lrt:        { label: "LRT",       color: "#10b981" }, // emerald-500
  uv_express: { label: "UV",        color: "#06b6d4" }, // cyan-500
  p2p:        { label: "P2P",       color: "#f97316" }, // orange-500
  tricycle:   { label: "Trike",     color: "#ec4899" }, // pink-500
};

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
// Connector — joins one leg's destination to another leg's origin
// ---------------------------------------------------------------------------

export const connectorSchema = z.object({
  id: z.string().min(1),
  mode: modeSchema,
  /** Alight here — must always be a destination end. */
  from: endRefSchema,
  /** Board here — must always be an origin end. */
  to: endRefSchema,
});

export type GuideConnector = z.infer<typeof connectorSchema>;

// ---------------------------------------------------------------------------
// Chain validation
// ---------------------------------------------------------------------------

function validateSingleChain(
  data: { legs: GuideLeg[]; connectors: GuideConnector[] },
  ctx: z.RefinementCtx
): void {
  const { legs, connectors } = data;
  const legIds = new Set(legs.map((l) => l.id));

  // 1. Each connector must have from.end==="destination", to.end==="origin",
  //    different legs, and both legs must exist.
  for (const c of connectors) {
    if (c.from.end !== "destination") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Connector ${c.id}: 'from' must point to a destination end` });
      return;
    }
    if (c.to.end !== "origin") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Connector ${c.id}: 'to' must point to an origin end` });
      return;
    }
    if (c.from.legId === c.to.legId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Connector ${c.id}: cannot connect a leg to itself` });
      return;
    }
    if (!legIds.has(c.from.legId) || !legIds.has(c.to.legId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Connector ${c.id}: references unknown leg` });
      return;
    }
  }

  // 2. For a chain: connectors.length must equal legs.length - 1
  if (connectors.length !== legs.length - 1) {
    const need = legs.length - 1;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${legs.length} leg${legs.length > 1 ? "s" : ""} need${legs.length === 1 ? "s" : ""} ${need} connector${need !== 1 ? "s" : ""} to form a chain (have ${connectors.length})`,
    });
    return;
  }

  if (legs.length <= 1) return; // single leg, no connectors needed — valid

  // 3. No branching: each leg's destination is a 'from' at most once;
  //    each leg's origin is a 'to' at most once.
  const fromCount = new Map<string, number>();
  const toCount = new Map<string, number>();
  for (const c of connectors) {
    fromCount.set(c.from.legId, (fromCount.get(c.from.legId) ?? 0) + 1);
    toCount.set(c.to.legId, (toCount.get(c.to.legId) ?? 0) + 1);
  }
  for (const [legId, count] of fromCount) {
    if (count > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Leg ${legId} destination is connected to more than one leg (no branching)` });
      return;
    }
  }
  for (const [legId, count] of toCount) {
    if (count > 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Leg ${legId} origin is connected from more than one leg (no branching)` });
      return;
    }
  }

  // 4. No cycles: directed graph from.legId → to.legId must be acyclic.
  //    With rules 2-3, this means it must form exactly one linear chain.
  const edges = new Map<string, string>(); // from.legId → to.legId
  for (const c of connectors) {
    edges.set(c.from.legId, c.to.legId);
  }
  const visited = new Set<string>();
  let current = legs.find((l) => !Array.from(edges.values()).includes(l.id))?.id;
  if (!current) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Connectors form a cycle — there must be one starting leg" });
    return;
  }
  while (current) {
    if (visited.has(current)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Connectors form a cycle" });
      return;
    }
    visited.add(current);
    current = edges.get(current);
  }
  if (visited.size !== legs.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Not all legs are part of the chain" });
  }
}

// ---------------------------------------------------------------------------
// Top-level guide map schema
// ---------------------------------------------------------------------------

export const guideMapDataSchema = z.object({
  version: z.literal(1),
  /** Discriminates from commuter map_data (which has no 'kind' field). */
  kind: z.literal("guide"),
  legs: z.array(legSchema).min(1, "At least one leg is required").max(8, "Maximum 8 legs"),
  connectors: z.array(connectorSchema).default([]),
}).superRefine(validateSingleChain);

export type GuideMapData = z.infer<typeof guideMapDataSchema>;

import { z } from "zod";

// Transport modes: mirrors the DB CHECK constraint on stops/routes tables
// (supabase/migrations/20260521150012_initial_schema.sql).

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

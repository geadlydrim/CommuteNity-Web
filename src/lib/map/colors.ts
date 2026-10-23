/**
 * The one map colour source: SVG thumbnails, MapLibre paint, and builder UI
 * read pin, line, and mode colours from here. Hex values because MapLibre
 * paint can't resolve CSS variables.
 */
import { MODE_META, type TransportMode } from "@/lib/schemas/modes";

/** Pin colour by role in a post map or guide leg. */
export const PIN_COLORS = {
  origin: "#22c55e", // green-500
  destination: "#ef4444", // red-500
  waypoint: "#6b7280", // gray-500
} as const;

/** Line through a post map's pins. Indigo-700: no transport mode uses it (bus is blue-500). */
export const POST_MAP_LINE_COLOR = "#4338ca";

/** Role colour of pin `index` in an ordered list of `total` pins (first = origin, last = destination). */
export function pinColor(index: number, total: number): string {
  if (index === 0) return PIN_COLORS.origin;
  if (index === total - 1) return PIN_COLORS.destination;
  return PIN_COLORS.waypoint;
}

/** Line colour for a transport mode. */
export function modeColor(mode: TransportMode): string {
  return MODE_META[mode].color;
}

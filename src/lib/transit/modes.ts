/**
 * Single source of truth for transit mode metadata.
 *
 * Consumed by:
 *   - <ModeBadge> component
 *   - Future MapLibre route-line layer colors (use `lineColor` field)
 *   - Future mode filter tabs / search UI
 *
 * `cssVar` matches the --mode-* tokens defined in globals.css.
 * `lineColor` is an OKLCH hex-equivalent fallback for contexts that can't
 * use CSS vars (MapLibre paint expressions need raw color strings).
 */

export type TransitMode =
  | "jeepney"
  | "bus"
  | "mrt"
  | "lrt"
  | "uv_express"
  | "p2p"
  | "tricycle"
  | "walking";

export interface TransitModeConfig {
  label: string;
  /** CSS variable name (without --) for use with var(--mode-*) */
  cssVar: string;
  /** Hex color fallback for MapLibre paint expressions */
  lineColor: string;
  /** Lucide icon name — import from lucide-react at point of use */
  icon: string;
}

export const TRANSIT_MODES: Record<TransitMode, TransitModeConfig> = {
  jeepney: {
    label: "Jeepney",
    cssVar: "mode-jeepney",
    lineColor: "#d97706", // amber-600 approx
    icon: "Bus",
  },
  bus: {
    label: "Bus",
    cssVar: "mode-bus",
    lineColor: "#2563eb", // blue-600 approx
    icon: "Bus",
  },
  mrt: {
    label: "MRT",
    cssVar: "mode-mrt",
    lineColor: "#7c3aed", // violet-600 approx
    icon: "Train",
  },
  lrt: {
    label: "LRT",
    cssVar: "mode-lrt",
    lineColor: "#ea580c", // orange-600 approx
    icon: "Train",
  },
  uv_express: {
    label: "UV Express",
    cssVar: "mode-uv",
    lineColor: "#0d9488", // teal-600 approx
    icon: "Car",
  },
  p2p: {
    label: "P2P Bus",
    cssVar: "mode-p2p",
    lineColor: "#16a34a", // green-600 approx
    icon: "Bus",
  },
  tricycle: {
    label: "Tricycle",
    cssVar: "mode-tricycle",
    lineColor: "#ca8a04", // yellow-600 approx
    icon: "Bike",
  },
  walking: {
    label: "Walking",
    cssVar: "mode-walking",
    lineColor: "#6b7280", // gray-500 approx
    icon: "Footprints",
  },
};

/** Ordered list for UI rendering (filter tabs, select options). */
export const TRANSIT_MODE_ORDER: TransitMode[] = [
  "jeepney",
  "bus",
  "mrt",
  "lrt",
  "uv_express",
  "p2p",
  "tricycle",
  "walking",
];

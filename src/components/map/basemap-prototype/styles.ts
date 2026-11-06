/**
 * PROTOTYPE — throwaway. Base map style variants for the wayfinder ticket
 * "Base map style: what shows at each zoom". Lives on the branch
 * `prototype/basemap-style`; never merge.
 *
 * Tiles: the local Protomaps Philippines extract served by
 * `pmtiles serve ~/.cache/commutenity/basemap/pmtiles --port=8081 --cors='*'`.
 * Fonts and sprites: Protomaps' GitHub Pages assets (production self-hosts them).
 */
import { layers, namedFlavor, type Flavor } from "@protomaps/basemaps";
import type { StyleSpecification } from "maplibre-gl";

export type Variant = "A" | "B" | "C" | "D";
export type Theme = "light" | "dark";

export const VARIANTS: Record<Variant, string> = {
  A: "Quiet grey (reference)",
  B: "Soft colour, text landmarks",
  C: "Bare",
  D: "Decided: A colours, text landmarks, transit icons",
};

const TILES = "http://localhost:8081/protomaps-20261105-ph-z15/{z}/{x}/{y}.mvt";
const GLYPHS = "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf";
const sprite = (t: Theme) => `https://protomaps.github.io/basemaps-assets/sprites/v4/${t}`;

/** Set every flavor key matching `test` to `value`. */
function paintKeys(f: Flavor, test: (k: string) => boolean, value: string): Flavor {
  const out = { ...f } as Record<string, unknown>;
  for (const k of Object.keys(out)) if (typeof out[k] === "string" && test(k)) out[k] = value;
  return out as unknown as Flavor;
}

/** The reference look: light grey land, white roads, grey labels. */
function quietGrey(theme: Theme): Flavor {
  const dark = theme === "dark";
  let f = namedFlavor(dark ? "dark" : "light");
  const land = dark ? "#1c1d20" : "#efefef";
  const block = dark ? "#26282c" : "#e3e3e3";
  const road = dark ? "#3a3d42" : "#ffffff";
  const casing = dark ? "#1c1d20" : "#dcdcdc";
  const label = dark ? "#9a9da3" : "#7c7c7c";
  const halo = dark ? "#1c1d20" : "#ffffff";
  f = paintKeys(f, (k) => /^(background|earth|pedestrian|glacier|sand|beach|aerodrome|military|industrial|hospital|school|zoo|pier)$/.test(k), land);
  f = paintKeys(f, (k) => /casing/.test(k), casing);
  f = paintKeys(f, (k) => /^(other|minor|minor_a|minor_b|minor_service|link|major|highway|bridges_|tunnel_)/.test(k) && !/casing/.test(k), road);
  f = paintKeys(f, (k) => /_label$|label_/.test(k) && !/halo/.test(k), label);
  f = paintKeys(f, (k) => /halo/.test(k), halo);
  return {
    ...f,
    buildings: block,
    water: dark ? "#1f3240" : "#aecde0",
    park_a: dark ? "#1f2a23" : "#dcead8",
    park_b: dark ? "#1f2a23" : "#cfe3c9",
    wood_a: dark ? "#1f2a23" : "#dcead8",
    wood_b: dark ? "#1f2a23" : "#cfe3c9",
    scrub_a: land,
    scrub_b: land,
    railway: dark ? "#55595f" : "#b5b5b5",
    boundaries: dark ? "#3b3e44" : "#cfcfcf",
  } as Flavor;
}

/** Protomaps light/dark with its colours toned down. */
function softColour(theme: Theme): Flavor {
  const f = namedFlavor(theme === "dark" ? "dark" : "light");
  return theme === "dark"
    ? { ...f, water: "#25303a", buildings: "#18191b" }
    : { ...f, background: "#ece9e4", earth: "#ece9e4", water: "#a9d8e6", buildings: "#dedad4", park_b: "#c4e0cc" };
}

/** Grayscale/black: almost nothing but streets and area names. */
function bare(theme: Theme): Flavor {
  const f = namedFlavor(theme === "dark" ? "black" : "white");
  return { ...f, water: theme === "dark" ? "#1b2630" : "#d5e6ef" };
}

/** Commuter landmarks (pois `kind`) and the zoom each appears from. */
const LANDMARKS: Record<Variant, Record<string, number>> = {
  A: {
    station: 13, ferry_terminal: 13, bus_station: 14, terminal: 14, jeepney_terminal: 14, tricycle_terminal: 15,
    mall: 14, marketplace: 15, hospital: 14, university: 15, college: 15, school: 16, place_of_worship: 16,
  },
  B: { station: 12, ferry_terminal: 13, mall: 13, hospital: 13, university: 14, marketplace: 15 },
  C: { station: 13 },
  D: {
    station: 13, ferry_terminal: 13, bus_station: 14, terminal: 14, jeepney_terminal: 14, tricycle_terminal: 15,
    mall: 14, marketplace: 15, hospital: 14, university: 15, college: 15, school: 16, place_of_worship: 16,
  },
};

const ICON: Record<string, string> = {
  station: "train_station",
  ferry_terminal: "ferry_terminal",
  bus_station: "bus_stop",
  terminal: "bus_stop",
  jeepney_terminal: "bus_stop",
  tricycle_terminal: "bus_stop",
  university: "university",
  college: "school",
  school: "school",
};

/** Zoom from which barangay (neighbourhood / macrohood) names show. */
const BARANGAY_FROM: Record<Variant, number> = { A: 14, B: 15, C: 15, D: 15 };

/** Decided variant D: icons only for transit landmarks. */
const TRANSIT = ["station", "ferry_terminal", "bus_station", "terminal", "jeepney_terminal", "tricycle_terminal"];

// Prototype: layers are edited as loose objects and handed back to MapLibre as-is.
type AnyLayer = { id: string; layout?: object; paint?: object } & Record<string, unknown>;

export function basemapStyle(variant: Variant, theme: Theme, thumbnail = false): StyleSpecification {
  const flavor = variant === "A" || variant === "D" ? quietGrey(theme) : variant === "B" ? softColour(theme) : bare(theme);
  let ls = layers("protomaps", flavor, { lang: "en" }) as AnyLayer[];

  // Never draw ESA WorldCover (its own CC-BY credit).
  ls = ls.filter((l) => l.id !== "landcover");
  // Bare: no buildings, no shields, no one-way arrows.
  if (variant === "C") ls = ls.filter((l) => l.id !== "buildings" && l.id !== "roads_shields");
  ls = ls.filter((l) => l.id !== "roads_oneway" && l.id !== "address_label");

  const marks = LANDMARKS[variant];
  const kinds = Object.keys(marks);
  ls = ls.map((l) => {
    if (l.id === "pois") {
      const zoomOf: unknown[] = ["match", ["get", "kind"]];
      for (const k of kinds) zoomOf.push(k, marks[k]);
      zoomOf.push(99);
      const iconOf: unknown[] = ["match", ["get", "kind"]];
      for (const [k, v] of Object.entries(ICON)) if (kinds.includes(k) && (variant !== "D" || TRANSIT.includes(k))) iconOf.push(k, v);
      iconOf.push("");
      const layout = { ...(l.layout as object), "icon-image": variant === "B" ? "" : iconOf, "text-size": 11 };
      const textColor = theme === "dark" ? "#a7abb2" : variant === "A" || variant === "D" ? "#6f6f6f" : "#5d5d5d";
      return {
        ...l,
        filter: ["all", ["in", ["get", "kind"], ["literal", kinds]], [">=", ["zoom"], zoomOf]],
        layout,
        paint: { ...(l.paint as object), "text-color": textColor },
      } as AnyLayer;
    }
    if (l.id === "places_subplace" && variant === "D") {
      // Decided: barangay names from z15, smaller, not in capitals.
      const layout = { ...(l.layout as object), "text-transform": "none", "text-letter-spacing": 0, "text-size": ["interpolate", ["linear"], ["zoom"], 15, 11, 18, 14] };
      return { ...l, minzoom: 15, layout } as AnyLayer;
    }
    if (l.id === "places_subplace") return { ...l, minzoom: BARANGAY_FROM[variant] } as AnyLayer;
    return l;
  });

  if (thumbnail) {
    // Thumbnail style: no landmarks, only major road and area names.
    const drop = ["pois", "roads_labels_minor", "roads_shields", "water_waterway_label", "water_label_lakes"];
    // Decided: thumbnails drop barangay names too.
    if (variant === "D") drop.push("places_subplace");
    ls = ls.filter((l) => !drop.includes(l.id));
  }

  return {
    version: 8,
    glyphs: GLYPHS,
    sprite: sprite(theme),
    sources: {
      protomaps: {
        type: "vector",
        tiles: [TILES],
        maxzoom: 15,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
      },
    },
    // Prototype: the edited layers are still valid MapLibre layers.
    layers: ls as unknown as StyleSpecification["layers"],
  };
}

/**
 * Pure state of the map-editing core shared by the post-map and guide
 * builders: editable pin slots (keyed by the builder), the slot the rider
 * selected, and placement. No React and no "use client", so Node tests import
 * it directly; `use-map-editor.ts` wires it to the map and the geocoder.
 *
 * Placement tokens: every click, drag, or search pick gives the slot a fresh
 * token. A reverse-geocode result carries the token of the placement that
 * started it and labels the slot only while that token is still the slot's
 * latest, so a slow lookup for an earlier drop can't overwrite a newer one.
 */
import type { GeocodeResult, ReverseGeocodeResult } from "@/lib/geo/types";
import { PH_LAT_RANGE, PH_LNG_RANGE, type MapPin } from "@/lib/schemas/post-map";

/** One editable pin; empty (no coordinates) until placed. */
export interface EditorSlot {
  lat: number | null;
  lng: number | null;
  /** Primary display name — landmark / POI (bold). */
  label: string;
  /** Secondary display name — barangay, city, province (grey sub-line). */
  sublabel: string;
  /** Token of the slot's latest placement (0 = seeded or never placed). */
  token: number;
  /** Placed by click or drag and waiting for its reverse-geocode label. */
  locating: boolean;
}

export type PlacedSlot = EditorSlot & { lat: number; lng: number };

export const EMPTY_SLOT: EditorSlot = {
  lat: null,
  lng: null,
  label: "",
  sublabel: "",
  token: 0,
  locating: false,
};

/** A slot the editor starts with: a saved pin, or `null` for an empty slot. */
export interface SeedSlot {
  key: string;
  pin: MapPin | null;
}

export interface MapEditorState {
  slots: ReadonlyMap<string, EditorSlot>;
  /** Slot the rider selected; `null` falls back to the first empty slot (`activeSlotKey`). */
  selected: string | null;
}

export type MapEditorAction =
  | { type: "add"; keys: readonly string[] }
  | { type: "remove"; keys: readonly string[] }
  | { type: "select"; key: string }
  /** Click or drag: coordinates now, label once the reverse geocode answers. */
  | { type: "place"; key: string; lat: number; lng: number; token: number }
  /** Search-result pick: coordinates and label at once. */
  | { type: "pick"; key: string; result: GeocodeResult; token: number }
  /** Reverse-geocode answer for placement `token`; `place: null` = lookup failed. */
  | { type: "located"; key: string; token: number; place: ReverseGeocodeResult | null }
  | { type: "label"; key: string; label: string };

export const OUTSIDE_PHILIPPINES = "Pins must be inside the Philippines.";

/** Why a pin can't go at (lat, lng), or `null` if it can. Same bounds as `pinSchema`. */
export function placementRefusal(lat: number, lng: number): string | null {
  const inside =
    lat >= PH_LAT_RANGE.min &&
    lat <= PH_LAT_RANGE.max &&
    lng >= PH_LNG_RANGE.min &&
    lng <= PH_LNG_RANGE.max;
  return inside ? null : OUTSIDE_PHILIPPINES;
}

export function isPlaced(slot: EditorSlot): slot is PlacedSlot {
  return slot.lat !== null && slot.lng !== null;
}

/** Nominatim names can exceed the pin label limit — clamp before storing. */
export function clampLabel(s: string): string {
  return s.trim().slice(0, 120);
}

function coordinateLabel(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

/** The pin a placed slot saves as; a blank label falls back to its coordinates. */
export function slotToPin(slot: PlacedSlot): MapPin {
  return {
    lat: slot.lat,
    lng: slot.lng,
    label: clampLabel(slot.label) || coordinateLabel(slot.lat, slot.lng),
    sublabel: clampLabel(slot.sublabel) || undefined,
  };
}

/** Bounding box of `pins` as [[west, south], [east, north]], or `null` for none. */
export function pinBounds(
  pins: readonly { lat: number; lng: number }[]
): [[number, number], [number, number]] | null {
  const first = pins[0];
  if (!first) return null;
  let west = first.lng;
  let east = first.lng;
  let south = first.lat;
  let north = first.lat;
  for (const { lat, lng } of pins) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return [
    [west, south],
    [east, north],
  ];
}

export function createEditorState(seed: readonly SeedSlot[]): MapEditorState {
  return {
    slots: new Map(
      seed.map(({ key, pin }): [string, EditorSlot] => [
        key,
        pin
          ? {
              ...EMPTY_SLOT,
              lat: pin.lat,
              lng: pin.lng,
              label: pin.label,
              sublabel: pin.sublabel ?? "",
            }
          : EMPTY_SLOT,
      ])
    ),
    selected: null,
  };
}

/**
 * The slot the next map click fills: the selected slot, else the first empty
 * slot in the builder's display `order`, else none.
 */
export function activeSlotKey(state: MapEditorState, order: readonly string[]): string | null {
  if (state.selected !== null && state.slots.has(state.selected)) return state.selected;
  return (
    order.find((key) => {
      const slot = state.slots.get(key);
      return slot !== undefined && !isPlaced(slot);
    }) ?? null
  );
}

/** Applies `update` to slot `key`; unknown keys and unchanged slots return `state` itself. */
function updateSlot(
  state: MapEditorState,
  key: string,
  update: (slot: EditorSlot) => EditorSlot
): MapEditorState {
  const slot = state.slots.get(key);
  if (!slot) return state;
  const next = update(slot);
  if (next === slot) return state;
  return { ...state, slots: new Map(state.slots).set(key, next) };
}

export function mapEditorReducer(state: MapEditorState, action: MapEditorAction): MapEditorState {
  switch (action.type) {
    case "add": {
      const slots = new Map(state.slots);
      for (const key of action.keys) if (!slots.has(key)) slots.set(key, EMPTY_SLOT);
      return { ...state, slots };
    }
    case "remove": {
      const slots = new Map(state.slots);
      for (const key of action.keys) slots.delete(key);
      const selected = state.selected !== null && slots.has(state.selected) ? state.selected : null;
      return { slots, selected };
    }
    case "select":
      return state.slots.has(action.key) ? { ...state, selected: action.key } : state;
    case "place": {
      const { key, lat, lng, token } = action;
      if (placementRefusal(lat, lng) !== null) return state;
      return updateSlot(state, key, () => ({ lat, lng, label: "", sublabel: "", token, locating: true }));
    }
    case "pick": {
      const { key, result, token } = action;
      if (placementRefusal(result.lat, result.lon) !== null) return state;
      return updateSlot(state, key, () => ({
        lat: result.lat,
        lng: result.lon,
        label: clampLabel(result.displayName),
        sublabel: clampLabel(result.secondaryName ?? ""),
        token,
        locating: false,
      }));
    }
    case "located": {
      const { key, token, place } = action;
      return updateSlot(state, key, (slot) => {
        // A newer placement, a search pick, or a typed label took over.
        if (slot.token !== token || !slot.locating || !isPlaced(slot)) return slot;
        return {
          ...slot,
          label: place ? clampLabel(place.displayName) : coordinateLabel(slot.lat, slot.lng),
          sublabel: place ? clampLabel(place.secondaryName ?? "") : "",
          locating: false,
        };
      });
    }
    case "label":
      return updateSlot(state, action.key, (slot) => ({ ...slot, label: action.label, locating: false }));
  }
}

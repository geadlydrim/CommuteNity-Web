/**
 * useMapEditor — the map-editing core both builders share. Owns the pin slots
 * and the active slot (state in `map-editor-state.ts`), search-result picking
 * with fly-to, click and drag placement inside the Philippines, reverse-geocode
 * labeling (one AbortController per slot: a new placement aborts the lookup it
 * supersedes, unmount aborts them all), and fitting the camera to the seeded
 * pins once the map loads.
 *
 * Builders keep only their own shape (ordered pins vs. legs and transfers) and
 * mount a fresh editor on every open (`useOpenSession`), so the seed is read
 * once, at mount.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { toast } from "sonner";
import { reverseGeocode, type GeocodeResult, type ReverseGeocodeResult } from "@/lib/geo";
import type { MapPin } from "@/lib/schemas/post-map";
import type { MapLayerMouseEvent, MapRef } from "./primitives";
import { fitPinsToView, type FitResult } from "./route-geometry";
import {
  EMPTY_SLOT,
  activeSlotKey,
  createEditorState,
  mapEditorReducer,
  pinBounds,
  placementRefusal,
  type EditorSlot,
  type SeedSlot,
} from "./map-editor-state";

export const NO_ACTIVE_SLOT = "Pick a pin to place first.";

/** Zoom for flying to a search pick and the most a seeded-pin fit zooms in. */
const PLACE_ZOOM = 14;
/** Container size the first-frame camera assumes, before the real fit on load. */
const FIRST_FRAME = { width: 560, height: 420 } as const;
const FIT_PADDING_PX = 48;

/**
 * Counts opens: increments each time `open` turns true. Key a builder's editor
 * with it so every open starts from `initialValue`, while a closing dialog
 * keeps its state through the exit animation.
 */
export function useOpenSession(open: boolean): number {
  const [state, setState] = useState({ open, session: 0 });
  if (state.open !== open) {
    setState({ open, session: open ? state.session + 1 : state.session });
  }
  return state.session;
}

export interface UseMapEditorOptions {
  /** Slots the editor starts with; read once, on mount. */
  initialSlots: readonly SeedSlot[];
  /** Every slot key in display order; with nothing selected, a click fills the first empty one. */
  order: readonly string[];
}

export function useMapEditor({ initialSlots, order }: UseMapEditorOptions) {
  const [state, dispatch] = useReducer(mapEditorReducer, initialSlots, createEditorState);
  // Re-renders after a refused drag so the marker snaps back to its slot.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const mapRef = useRef<MapRef | null>(null);
  const lastToken = useRef(0);
  const [lookups] = useState(() => new Map<string, AbortController>());
  const [seedPins] = useState<MapPin[]>(() =>
    initialSlots.flatMap(({ pin }) => (pin ? [pin] : []))
  );
  const [initialViewState] = useState<FitResult | undefined>(() =>
    seedPins.length > 0 ? fitPinsToView(seedPins, FIRST_FRAME.width, FIRST_FRAME.height) : undefined
  );

  useEffect(
    () => () => {
      for (const lookup of lookups.values()) lookup.abort();
      lookups.clear();
    },
    [lookups]
  );

  const abortLookup = useCallback(
    (key: string) => {
      lookups.get(key)?.abort();
      lookups.delete(key);
    },
    [lookups]
  );

  /** A fresh placement token for `key`; aborts the lookup it supersedes. */
  const supersede = useCallback(
    (key: string) => {
      abortLookup(key);
      lastToken.current += 1;
      return lastToken.current;
    },
    [abortLookup]
  );

  /** Click or drag placement: refused outside the Philippines, else placed and reverse-geocoded. */
  const placeAt = useCallback(
    (key: string, lat: number, lng: number): boolean => {
      const refusal = placementRefusal(lat, lng);
      if (refusal !== null) {
        toast.error(refusal);
        rerender();
        return false;
      }
      const token = supersede(key);
      const lookup = new AbortController();
      lookups.set(key, lookup);
      dispatch({ type: "place", key, lat, lng, token });

      void (async () => {
        let place: ReverseGeocodeResult | null = null;
        try {
          place = await reverseGeocode(lat, lng, { signal: lookup.signal });
        } catch {
          // Labelled with its coordinates below, unless superseded.
        }
        if (lookup.signal.aborted) return;
        if (lookups.get(key) === lookup) lookups.delete(key);
        dispatch({ type: "located", key, token, place });
      })();
      return true;
    },
    [lookups, supersede]
  );

  /** Search-result pick: place, select, and fly there. */
  const pick = useCallback(
    (key: string, result: GeocodeResult) => {
      const refusal = placementRefusal(result.lat, result.lon);
      if (refusal !== null) {
        toast.error(refusal);
        return;
      }
      dispatch({ type: "pick", key, result, token: supersede(key) });
      dispatch({ type: "select", key });
      mapRef.current?.flyTo({ center: [result.lon, result.lat], zoom: PLACE_ZOOM, duration: 800 });
    },
    [supersede]
  );

  const activeKey = activeSlotKey(state, order);

  const onMapClick = useCallback(
    (e: MapLayerMouseEvent) => {
      if (activeKey === null) {
        toast.error(NO_ACTIVE_SLOT);
        return;
      }
      if (placeAt(activeKey, e.lngLat.lat, e.lngLat.lng)) dispatch({ type: "select", key: activeKey });
    },
    [activeKey, placeAt]
  );

  /** Fits the camera to the seeded pins at the map's real size. */
  const onMapLoad = useCallback(() => {
    const bounds = pinBounds(seedPins);
    if (bounds) {
      mapRef.current?.fitBounds(bounds, {
        padding: FIT_PADDING_PX,
        maxZoom: PLACE_ZOOM,
        duration: 0,
      });
    }
  }, [seedPins]);

  const select = useCallback((key: string) => dispatch({ type: "select", key }), []);

  const addSlots = useCallback(
    (keys: readonly string[]) => dispatch({ type: "add", keys }),
    []
  );

  const removeSlots = useCallback(
    (keys: readonly string[]) => {
      for (const key of keys) abortLookup(key);
      dispatch({ type: "remove", keys });
    },
    [abortLookup]
  );

  const setLabel = useCallback(
    (key: string, label: string) => dispatch({ type: "label", key, label }),
    []
  );

  const slot = useCallback(
    (key: string): EditorSlot => state.slots.get(key) ?? EMPTY_SLOT,
    [state.slots]
  );

  return {
    /** Slot state by key; changes identity on every slot edit (memo dependency). */
    slots: state.slots,
    slot,
    activeKey,
    select,
    addSlots,
    removeSlots,
    setLabel,
    pick,
    /** Drag-end placement (map clicks go through `onMapClick`). */
    placeAt,
    mapRef,
    initialViewState,
    onMapClick,
    onMapLoad,
  };
}

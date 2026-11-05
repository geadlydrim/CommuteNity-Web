/**
 * useReshape — runs Reshape mode for the guide builder. The state and every
 * decision (which segment a tap lands in, the via cap, undo, the "old route"
 * notice) live in `reshape-state.ts`; this hook owns the reducer, keeps it in
 * sync with the builder's legs, and refuses vias outside the Philippines (the
 * same bounds a pin has) with the editor's own message.
 */
import { useCallback, useEffect, useReducer } from "react";
import { toast } from "sonner";
import type { LatLng } from "@/lib/map/path";
import type { TransportMode } from "@/lib/schemas/modes";
import { placementRefusal } from "./map-editor-state";
import {
  createReshapeState,
  reshapeReducer,
  type PinMoveSource,
  type ReshapeLegRef,
  type SeedVias,
} from "./reshape-state";

/** A leg's two ends as placed points; `null` while one is empty. */
export interface LegEnds {
  origin: LatLng | null;
  destination: LatLng | null;
}

/**
 * @param legs the builder's legs; a leg that is gone or became a rail leg loses its vias.
 * @param seed a reopened draft's vias per leg; read once, on mount.
 * @param endsOf a leg's placed pins, for the nearest-segment rule of a tap.
 */
export function useReshape(
  legs: readonly ReshapeLegRef[],
  seed: readonly SeedVias[],
  endsOf: (legId: string) => LegEnds
) {
  const [state, dispatch] = useReducer(reshapeReducer, seed, createReshapeState);
  // Re-renders after a refused via drag so the marker snaps back.
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    dispatch({ type: "sync", legs });
  }, [legs]);

  /** Whether `point` can't hold a via; tells the author why. */
  const refuse = useCallback((point: LatLng): boolean => {
    const refusal = placementRefusal(point.lat, point.lng);
    if (refusal === null) return false;
    toast.error(refusal);
    rerender();
    return true;
  }, []);

  const enter = useCallback(
    (legId: string, mode: TransportMode) => dispatch({ type: "enter", legId, mode }),
    []
  );
  const exit = useCallback(() => dispatch({ type: "exit" }), []);

  /** A map tap while a leg is reshaped: a via in the nearest segment of that leg. */
  const tap = useCallback(
    (point: LatLng) => {
      if (state.active === null || refuse(point)) return;
      const { origin, destination } = endsOf(state.active);
      if (origin && destination) dispatch({ type: "tap", origin, destination, point });
    },
    [state.active, endsOf, refuse]
  );

  const moveVia = useCallback(
    (legId: string, index: number, point: LatLng) => {
      if (refuse(point)) return;
      dispatch({ type: "moveVia", legId, index, point });
    },
    [refuse]
  );

  const removeVia = useCallback(
    (legId: string, index: number) => dispatch({ type: "removeVia", legId, index }),
    []
  );
  const clearVias = useCallback((legId: string) => dispatch({ type: "clearVias", legId }), []);
  const undo = useCallback((legId: string) => dispatch({ type: "undo", legId }), []);

  /** One of a leg's pins is about to move: its vias stay, and a far move raises the notice. */
  const pinMoved = useCallback(
    (legId: string, from: LatLng | null, to: LatLng, source: PinMoveSource) => {
      if (placementRefusal(to.lat, to.lng) === null) dispatch({ type: "pinMoved", legId, from, to, source });
    },
    []
  );

  return { state, enter, exit, tap, moveVia, removeVia, clearVias, undo, pinMoved };
}

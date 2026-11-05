/**
 * usePairRouting — runs the street-path requests for a post map's pin pairs.
 * The state and every decision (which pair is stale, what to request, what to
 * cancel) live in `pair-routing-state.ts`; `driveRouting` hands them to a route
 * scheduler (`@/lib/routing/scheduler`: 300 ms debounce, latest wins, a session
 * cache, 4 requests at a time). This hook keeps the state in sync with the
 * builder's pairs and owns one scheduler per builder session, reset when the
 * builder closes or unmounts so its cache goes with it.
 *
 * `hold` / `release` bracket a pin drag: a pair being held makes no request
 * until the drag ends.
 */
import { useCallback, useEffect, useReducer, useState } from "react";
import { fetchRoute } from "@/lib/routing/client";
import { createRouteScheduler } from "@/lib/routing/scheduler";
import { driveRouting } from "./pair-routing-driver";
import {
  createPairRoutingState,
  pairRoutingReducer,
  type PairInput,
  type SeedPair,
} from "./pair-routing-state";

/**
 * @param pairs consecutive placed pins; memoize it, the hook re-syncs when its identity changes.
 * @param seed pairs of a reopened draft with their stored paths; read once, on mount.
 * @param open whether the builder is open; closing drops every request and the cache.
 */
export function usePairRouting(pairs: readonly PairInput[], seed: readonly SeedPair[], open = true) {
  const [state, dispatch] = useReducer(pairRoutingReducer, seed, createPairRoutingState);
  const [scheduler] = useState(() => createRouteScheduler({ route: fetchRoute }));
  /** Pair id → token of the job scheduled for it. */
  const [tracked] = useState(() => new Map<string, number>());

  useEffect(() => {
    dispatch({ type: "sync", pairs });
  }, [pairs]);

  useEffect(() => {
    if (open) driveRouting(state, tracked, scheduler, dispatch);
  }, [state, open, scheduler, tracked]);

  useEffect(() => {
    if (!open) return;
    return () => {
      scheduler.reset();
      tracked.clear();
    };
  }, [open, scheduler, tracked]);

  const hold = useCallback(
    (ids: readonly string[]) => {
      for (const id of ids) scheduler.hold(id);
    },
    [scheduler]
  );
  const release = useCallback(
    (ids: readonly string[]) => {
      for (const id of ids) scheduler.release(id);
    },
    [scheduler]
  );

  return { state, hold, release };
}

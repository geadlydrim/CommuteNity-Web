/**
 * useRouting — runs the street-path requests for a builder's stretches (a post
 * map's pin pairs, a guide's road and walking legs). The state and every
 * decision (which stretch is stale, what to request, what to cancel) live in
 * `routing-state.ts`; `driveRouting` hands them to a route scheduler
 * (`@/lib/routing/scheduler`: 300 ms debounce, latest wins, a session cache,
 * 4 requests at a time). This hook keeps the state in sync with the builder's
 * stretches and owns one scheduler per builder session, reset when the builder
 * closes or unmounts so its cache goes with it.
 *
 * `hold` / `release` bracket a pin drag: a stretch being held makes no request
 * until the drag ends.
 */
import { useCallback, useEffect, useReducer, useState } from "react";
import { fetchRoute } from "@/lib/routing/client";
import { createRouteScheduler } from "@/lib/routing/scheduler";
import { driveRouting } from "./routing-driver";
import { createRoutingState, routingReducer, type SeedStretch, type StretchInput } from "./routing-state";

/**
 * @param stretches the builder's current stretches; memoize it, the hook re-syncs when its identity changes.
 * @param seed stretches of a reopened draft with their stored paths; read once, on mount.
 * @param open whether the builder is open; closing drops every request and the cache.
 */
export function useRouting(stretches: readonly StretchInput[], seed: readonly SeedStretch[], open = true) {
  const [state, dispatch] = useReducer(routingReducer, seed, createRoutingState);
  const [scheduler] = useState(() => createRouteScheduler({ route: fetchRoute }));
  /** Stretch id → token of the job scheduled for it. */
  const [tracked] = useState(() => new Map<string, number>());

  useEffect(() => {
    dispatch({ type: "sync", stretches });
  }, [stretches]);

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

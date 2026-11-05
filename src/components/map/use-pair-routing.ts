/**
 * usePairRouting — runs the street-path requests for a post map's pin pairs.
 * The state and every decision (which pair is stale, what to request, what to
 * cancel) live in `pair-routing-state.ts`; this hook only keeps the state in
 * sync with the builder's pairs, starts and cancels the requests it asks for,
 * and aborts them all on unmount.
 *
 * One request per pair at a time: re-requesting a pair aborts its running
 * request, and a result carries the token of the request it answers, so a
 * stale one never applies. No debounce, cache, or concurrency cap yet.
 */
import { useEffect, useReducer, useState } from "react";
import { fetchRoute, type RouteOutcome } from "@/lib/routing/client";
import {
  createPairRoutingState,
  pairRoutingReducer,
  routingWork,
  type PairInput,
  type PairOutcome,
  type SeedPair,
} from "./pair-routing-state";

/** What the state needs to know of a finished request; `null` when it was cancelled. */
function toPairOutcome(outcome: RouteOutcome): PairOutcome | null {
  switch (outcome.status) {
    case "ok":
      return { status: "ok", path: outcome.route.path };
    case "unavailable":
      return { status: "unavailable" };
    case "failed":
      return { status: "failed" };
    case "aborted":
      return null;
  }
}

interface Running {
  token: number;
  controller: AbortController;
}

/**
 * @param pairs consecutive placed pins; memoize it, the hook re-syncs when its identity changes.
 * @param seed pairs of a reopened draft with their stored paths; read once, on mount.
 */
export function usePairRouting(pairs: readonly PairInput[], seed: readonly SeedPair[]) {
  const [state, dispatch] = useReducer(pairRoutingReducer, seed, createPairRoutingState);
  const [running] = useState(() => new Map<string, Running>());

  useEffect(() => {
    dispatch({ type: "sync", pairs });
  }, [pairs]);

  useEffect(() => {
    const tokens = new Map([...running].map(([id, run]) => [id, run.token]));
    const { start, abort } = routingWork(state, tokens);

    for (const id of abort) {
      running.get(id)?.controller.abort();
      running.delete(id);
    }
    for (const { id, token, request } of start) {
      const controller = new AbortController();
      running.set(id, { token, controller });
      void fetchRoute(request, controller.signal).then((outcome) => {
        if (controller.signal.aborted) return;
        if (running.get(id)?.controller === controller) running.delete(id);
        const result = toPairOutcome(outcome);
        if (result) dispatch({ type: "result", id, token, outcome: result });
      });
    }
  }, [state, running]);

  useEffect(
    () => () => {
      for (const run of running.values()) run.controller.abort();
      running.clear();
    },
    [running]
  );

  return state;
}

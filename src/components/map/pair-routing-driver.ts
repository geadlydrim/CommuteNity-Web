/**
 * Brings a route scheduler in line with the pair routing state: schedules a
 * job for every pair the state is waiting on, cancels the jobs of pairs that
 * are gone or waiting for a newer token, and feeds each result back as an
 * action. No React, so Node tests run it with the real reducer and a fake
 * scheduler; `use-pair-routing.ts` calls it after every state change.
 */
import type { RouteResult, RouteScheduler } from "@/lib/routing/scheduler";
import {
  routingWork,
  type PairOutcome,
  type PairRoutingAction,
  type PairRoutingState,
} from "./pair-routing-state";

/** What the state needs to know of a finished job. */
function toPairOutcome(result: RouteResult): PairOutcome {
  switch (result.status) {
    case "ok":
      return { status: "ok", path: result.route.path };
    case "unavailable":
      return { status: "unavailable" };
    case "failed":
      return { status: "failed" };
  }
}

/**
 * @param tracked pair id → token of the job scheduled for it; owned by the
 * caller and cleared by it when the scheduler is reset.
 */
export function driveRouting(
  state: PairRoutingState,
  tracked: Map<string, number>,
  scheduler: RouteScheduler,
  dispatch: (action: PairRoutingAction) => void
): void {
  const { start, abort } = routingWork(state, tracked);

  // Cancel before scheduling: a pair that moved appears in both lists.
  for (const id of abort) {
    scheduler.cancel(id);
    tracked.delete(id);
  }
  for (const { id, token, request } of start) {
    tracked.set(id, token);
    scheduler.schedule(id, request, (result) => {
      if (tracked.get(id) === token) tracked.delete(id);
      dispatch({ type: "result", id, token, outcome: toPairOutcome(result) });
    });
  }
}

import type { MapPin } from "./post-map";

/**
 * The guide chain rule: a guide's legs, joined by transfers, must form one
 * linear chain. Each transfer runs from one leg's destination to another
 * leg's origin; every leg has at most one transfer before and one after it;
 * there are no loops, and every leg is on the chain.
 *
 * Validity doesn't depend on the order of `legs`; the order only names legs
 * in messages ("leg 2") and picks which gap a missing transfer is reported in.
 * Both the guide schema's refinement and the builder's Save hint call this,
 * so they can't disagree.
 */

/** A leg as far as the chain cares; a missing end is `null`. */
export interface ChainLeg {
  id: string;
  origin: MapPin | null;
  destination: MapPin | null;
}

/** A transfer as far as the chain cares (a stored connector fits this). */
export interface ChainTransfer {
  from: { legId: string; end: "origin" | "destination" };
  to: { legId: string; end: "origin" | "destination" };
}

/** Leg and transfer numbers are 1-based positions, as riders count them. */
export type GuideChainProblem =
  | { kind: "missing-end"; leg: number }
  | { kind: "invalid-transfer"; transfer: number }
  | { kind: "branching"; leg: number; side: "before" | "after" }
  | { kind: "cycle" }
  | { kind: "missing-transfer"; between: [number, number] };

export type GuideChainStatus =
  | { ok: true }
  | { ok: false; problem: GuideChainProblem; message: string };

function fail(problem: GuideChainProblem): GuideChainStatus {
  return { ok: false, problem, message: chainProblemMessage(problem) };
}

export function chainProblemMessage(problem: GuideChainProblem): string {
  switch (problem.kind) {
    case "missing-end":
      return `Leg ${problem.leg} needs an origin and a destination.`;
    case "invalid-transfer":
      return `Transfer ${problem.transfer} must link one leg's destination to another leg's origin.`;
    case "branching":
      return `Leg ${problem.leg} has more than one transfer ${problem.side} it. A guide is a single chain.`;
    case "cycle":
      return "The transfers loop back on themselves. A guide runs from one start to one end.";
    case "missing-transfer":
      return `Add a transfer between legs ${problem.between[0]} and ${problem.between[1]}.`;
  }
}

/** Returns ok, or the first problem with the chain. */
export function guideChainStatus(
  legs: readonly ChainLeg[],
  transfers: readonly ChainTransfer[],
): GuideChainStatus {
  // 1. Every leg has both ends.
  const incomplete = legs.findIndex((l) => l.origin === null || l.destination === null);
  if (incomplete !== -1) return fail({ kind: "missing-end", leg: incomplete + 1 });

  // A leg is its position; a repeated id resolves to its first position, so
  // the repeat is left off the chain and reported below.
  const position = new Map<string, number>();
  legs.forEach((l, i) => {
    if (!position.has(l.id)) position.set(l.id, i);
  });

  // 2. Every transfer runs from a destination to an origin of known legs;
  //    a transfer from a leg to itself is a loop.
  const edges: [number, number][] = [];
  for (const [t, transfer] of transfers.entries()) {
    const from = position.get(transfer.from.legId);
    const to = position.get(transfer.to.legId);
    if (
      transfer.from.end !== "destination" ||
      transfer.to.end !== "origin" ||
      from === undefined ||
      to === undefined
    ) {
      return fail({ kind: "invalid-transfer", transfer: t + 1 });
    }
    if (from === to) return fail({ kind: "cycle" });
    edges.push([from, to]);
  }

  // 3. No branching: at most one transfer after and one before each leg.
  const next: (number | undefined)[] = [];
  const prev: (number | undefined)[] = [];
  for (const [from, to] of edges) {
    if (next[from] !== undefined) return fail({ kind: "branching", leg: from + 1, side: "after" });
    if (prev[to] !== undefined) return fail({ kind: "branching", leg: to + 1, side: "before" });
    next[from] = to;
    prev[to] = from;
  }

  // 4. No loops. Without branching the legs split into separate runs and
  //    loops; walking every run from its first leg reaches every leg not
  //    stuck in a loop.
  const reached = new Set<number>();
  let runs = 0;
  for (let i = 0; i < legs.length; i++) {
    if (prev[i] !== undefined) continue;
    runs++;
    for (let at: number | undefined = i; at !== undefined; at = next[at]) reached.add(at);
  }
  if (reached.size !== legs.length) return fail({ kind: "cycle" });

  // 5. One run. With more than one, some neighbouring pair of legs isn't
  //    linked in order; report the first such gap.
  if (runs > 1) {
    for (let i = 0; i < legs.length - 1; i++) {
      if (next[i] !== i + 1) return fail({ kind: "missing-transfer", between: [i + 1, i + 2] });
    }
  }

  return { ok: true };
}

/**
 * What a guide's rail legs look like, as pure functions: a leg of mode MRT or
 * LRT follows the track between the stations nearest its pins (`sliceRail`), or
 * keeps a straight line and says why. No React and no "use client", so Node
 * tests import it directly.
 *
 * A rail leg is never routed (`legStretch` gives it no stretch); its path comes
 * from here, synchronously, once the rail file has loaded.
 */
import { encodePath, type LatLng } from "@/lib/map/path";
import { isRailMode, sliceRail, type RailData, type RailMode, type RailNoPathReason } from "@/lib/rail/slice";
import { MODE_META, type TransportMode } from "@/lib/schemas/modes";

export { isRailMode };

/** Why a rail leg is drawn straight: no slice, or the rail file itself didn't load. */
export type RailHintReason = RailNoPathReason | "load-failed";

/** A rail leg's line: the slice (and its encoded form, as saved), or the straight line and the hint that explains it. */
export type RailLegOutcome =
  | { ok: true; points: LatLng[]; path: string }
  | { ok: false; hint: string };

/** The part of a builder leg that decides whether and how it follows a rail line. */
export interface RailLegInput {
  id: string;
  mode: TransportMode;
}

/** The author-facing hint for a rail leg of `mode` that stays straight. */
export function railHint(mode: RailMode, reason: RailHintReason): string {
  const label = MODE_META[mode].label;
  switch (reason) {
    case "no-station":
      return `Not near an ${label} station — move the pin to a station to follow the line`;
    case "same-station":
      return `Both pins are at the same ${label} station — move one to another station to follow the line`;
    case "different-lines":
      return `The pins are at stations on different ${label} lines — move a pin so both are at stations on one line`;
    case "load-failed":
      return `Couldn't load the ${label} lines — showing a straight line`;
  }
}

/** The line of one rail leg between its two placed ends. */
export function railLegOutcome(rail: RailData, mode: RailMode, origin: LatLng, destination: LatLng): RailLegOutcome {
  const slice = sliceRail(rail, mode, origin, destination);
  if (!slice.ok) return { ok: false, hint: railHint(mode, slice.reason) };
  return { ok: true, points: slice.points, path: encodePath(slice.points) };
}

/**
 * The outcome of every rail leg that has both ends placed, by leg id. Road and
 * walking legs, and legs with an empty end, have no entry. `rail` is `null`
 * when the rail file failed to load: every rail leg then stays straight with
 * the load-failure hint.
 */
export function railLegOutcomes(
  rail: RailData | null,
  legs: readonly RailLegInput[],
  endsOf: (legId: string) => { origin: LatLng | null; destination: LatLng | null }
): Map<string, RailLegOutcome> {
  const outcomes = new Map<string, RailLegOutcome>();
  for (const { id, mode } of legs) {
    if (!isRailMode(mode)) continue;
    const { origin, destination } = endsOf(id);
    if (!origin || !destination) continue;
    outcomes.set(
      id,
      rail ? railLegOutcome(rail, mode, origin, destination) : { ok: false, hint: railHint(mode, "load-failed") }
    );
  }
  return outcomes;
}

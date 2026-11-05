/**
 * What each builder asks the router for, as pure functions: a post map's pin
 * pair and a guide's leg become `StretchInput`s for the routing state. No React
 * and no "use client", so Node tests import it directly.
 *
 * A guide's transfers never appear here: they stay straight, dashed lines.
 */
import type { LatLng } from "@/lib/map/path";
import type { Via } from "@/lib/schemas/guide-map";
import { POST_MAP_PAIR, legOptions } from "@/lib/schemas/leg-options";
import type { TransportMode } from "@/lib/schemas/modes";
import type { StretchInput } from "./routing-state";

// ---------------------------------------------------------------------------
// Post maps
// ---------------------------------------------------------------------------

/** The id of the pair between two slots. */
export function pairId(fromKey: string, toKey: string): string {
  return `${fromKey}>${toKey}`;
}

/** A post map's pin pair: a car, expressways allowed. */
export function pairStretch(id: string, from: LatLng, to: LatLng): StretchInput {
  return { id, points: [from, to], profile: "car", expressways: legOptions(POST_MAP_PAIR).expressways };
}

// ---------------------------------------------------------------------------
// Guides
// ---------------------------------------------------------------------------

/** The part of a builder leg that decides how it is routed. */
export interface RoutedLeg {
  id: string;
  mode: TransportMode;
  /** Only meaningful for a car leg; see `usesExpressways`. */
  expressways: boolean;
  /** Ordered points the path is forced through, kept as stored. */
  vias: readonly Via[];
}

/** Whether a leg of `mode` offers the "Uses expressways" switch: only vehicle legs on the road. */
export function hasExpresswaysChoice(mode: TransportMode): boolean {
  return legOptions(mode).profile === "car";
}

/** `leg` with a new mode; its expressways choice resets to the new mode's default. */
export function withMode<T extends { mode: TransportMode; expressways: boolean }>(leg: T, mode: TransportMode): T {
  return { ...leg, mode, expressways: legOptions(mode).expressways };
}

/**
 * The stretch to route for a leg whose two ends are placed: origin, its vias in
 * order, destination, with the mode's profile and the leg's own expressways
 * choice (a walking leg never uses expressways). `null` for a rail leg, which
 * follows the rail file instead of a router.
 */
export function legStretch(leg: RoutedLeg, origin: LatLng, destination: LatLng): StretchInput | null {
  const { profile } = legOptions(leg.mode);
  if (profile === "rail") return null;
  return {
    id: leg.id,
    points: [origin, ...leg.vias.map(({ lat, lng }) => ({ lat, lng })), destination],
    profile,
    expressways: profile === "car" && leg.expressways,
  };
}

/** The stretch of every leg that has both ends placed and goes through a router, in leg order. */
export function legStretches(
  legs: readonly RoutedLeg[],
  endsOf: (legId: string) => { origin: LatLng | null; destination: LatLng | null }
): StretchInput[] {
  return legs.flatMap((leg) => {
    const { origin, destination } = endsOf(leg.id);
    const stretch = origin && destination ? legStretch(leg, origin, destination) : null;
    return stretch ? [stretch] : [];
  });
}

import type { TransportMode } from "./modes";

/**
 * How a leg (or a post map's pin pair) is routed. Pure: no router, no network.
 *
 * The profile and the router's distance and time are derived, never stored
 * (ADR 0004); only the `expressways` choice is stored on a guide leg.
 */

/** `rail` legs follow the committed rail file instead of a router. */
export type LegProfile = "walk" | "car" | "rail";

export interface LegOptions {
  profile: LegProfile;
  /**
   * Whether the leg's street path may use expressways and tolls by default.
   * `false` for profiles with no such choice (walk, rail), so a stored
   * `expressways` is always a plain boolean.
   */
  expressways: boolean;
}

/** What to route a post map's consecutive pin pair as: a car, expressways allowed. */
export const POST_MAP_PAIR = "post-map-pair";

const WALK: LegOptions = { profile: "walk", expressways: false };
const CAR_AVOID: LegOptions = { profile: "car", expressways: false };
const CAR_ALLOW: LegOptions = { profile: "car", expressways: true };
const RAIL: LegOptions = { profile: "rail", expressways: false };

const BY_MODE: Record<TransportMode, LegOptions> = {
  walking: WALK,
  jeepney: CAR_AVOID,
  tricycle: CAR_AVOID,
  bus: CAR_AVOID,
  uv_express: CAR_ALLOW,
  p2p: CAR_ALLOW,
  mrt: RAIL,
  lrt: RAIL,
};

/** The routing profile and expressways default for a guide leg's mode, or for a post-map pair. */
export function legOptions(subject: TransportMode | typeof POST_MAP_PAIR): LegOptions {
  return subject === POST_MAP_PAIR ? CAR_ALLOW : BY_MODE[subject];
}

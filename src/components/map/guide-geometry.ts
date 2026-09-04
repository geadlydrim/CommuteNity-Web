/**
 * Geometry helpers for the guide map (multi-leg, multi-modal).
 *
 * Reuses worldX / worldY / fitPinsToView from route-geometry.ts.
 * No "use client" — plain math, importable anywhere.
 */
import type { MapPin } from "@/lib/schemas/post-map";
import type { GuideLeg, GuideConnector } from "@/lib/schemas/guide-map";
import { MODE_META } from "@/lib/schemas/guide-map";
import { fitPinsToView, worldX, worldY, type FitResult } from "./route-geometry";

export { worldX, worldY };

// ---------------------------------------------------------------------------
// Pin helpers
// ---------------------------------------------------------------------------

/** Flatten every leg's origin + destination into a pin list (for fitPinsToView). */
export function guideAllPins(legs: GuideLeg[]): MapPin[] {
  return legs.flatMap((l) => [l.origin, l.destination]);
}

/** Fit all guide map pins into a viewport. */
export function guideMapFit(legs: GuideLeg[], width: number, height: number): FitResult {
  return fitPinsToView(guideAllPins(legs), width, height);
}

// ---------------------------------------------------------------------------
// Segment helpers (for SVG + MapLibre line layers)
// ---------------------------------------------------------------------------

export interface MapSegment {
  /** [lng, lat] pairs */
  coords: [number, number][];
  color: string;
  /** true = dashed (connector transfer); false = solid (leg segment) */
  dashed: boolean;
}

/** One solid-line segment per leg, colored by transport mode. */
export function legSegments(legs: GuideLeg[]): MapSegment[] {
  return legs.map((l) => ({
    coords: [
      [l.origin.lng, l.origin.lat],
      [l.destination.lng, l.destination.lat],
    ],
    color: MODE_META[l.mode].color,
    dashed: false,
  }));
}

/** One dashed-line segment per connector (the transfer walk/ride). */
export function connectorSegments(
  legs: GuideLeg[],
  connectors: GuideConnector[]
): MapSegment[] {
  const legMap = new Map(legs.map((l) => [l.id, l]));
  return connectors.flatMap((c) => {
    const fromLeg = legMap.get(c.from.legId);
    const toLeg = legMap.get(c.to.legId);
    if (!fromLeg || !toLeg) return [];
    const fromPin = fromLeg.destination; // always "destination" end per schema
    const toPin = toLeg.origin;          // always "origin" end per schema
    return [{
      coords: [
        [fromPin.lng, fromPin.lat],
        [toPin.lng, toPin.lat],
      ],
      color: MODE_META[c.mode].color,
      dashed: true,
    }];
  });
}

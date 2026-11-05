/**
 * Geometry helpers for the guide map (multi-leg, multi-modal).
 *
 * Reuses worldX / worldY / fitPointsToView / storedPathPoints from
 * post-map-geometry.ts. A leg draws its stored street path, or the straight
 * line between its ends when it has none (or the stored path doesn't decode).
 * No "use client" — plain math, importable anywhere.
 */
import type { LatLng } from "@/lib/map/path";
import { modeColor } from "@/lib/map/colors";
import type { MapPin } from "@/lib/schemas/post-map";
import type { GuideLeg, GuideTransfer } from "@/lib/schemas/guide-map";
import {
  fitPointsToView,
  storedPathPoints,
  worldX,
  worldY,
  type FitResult,
} from "./post-map-geometry";

export { worldX, worldY };

// ---------------------------------------------------------------------------
// Pin and framing helpers
// ---------------------------------------------------------------------------

/** Flatten every leg's origin + destination into a pin list. */
export function guideAllPins(legs: GuideLeg[]): MapPin[] {
  return legs.flatMap((l) => [l.origin, l.destination]);
}

/** Everything framing must keep in view: every leg's pins plus every stored path point. */
export function guideFramingPoints(legs: GuideLeg[]): LatLng[] {
  const points: LatLng[] = guideAllPins(legs).map(({ lat, lng }) => ({ lat, lng }));
  for (const leg of legs) {
    const decoded = storedPathPoints(leg.path);
    if (decoded) for (const p of decoded) points.push(p);
  }
  return points;
}

/** Fit a guide into a viewport: its pins plus every leg's path points, so a path that bulges past its pins stays in frame. */
export function guideMapFit(legs: GuideLeg[], width: number, height: number): FitResult {
  return fitPointsToView(guideFramingPoints(legs), width, height);
}

// ---------------------------------------------------------------------------
// Segment helpers (for SVG + MapLibre line layers)
// ---------------------------------------------------------------------------

export interface MapSegment {
  /** [lng, lat] pairs */
  coords: [number, number][];
  color: string;
}

/** The line drawn for one leg: its stored street path, or the straight line between its ends. */
export function legLinePoints(leg: GuideLeg): LatLng[] {
  return (
    storedPathPoints(leg.path) ?? [
      { lat: leg.origin.lat, lng: leg.origin.lng },
      { lat: leg.destination.lat, lng: leg.destination.lng },
    ]
  );
}

/** One solid-line segment per leg, colored by transport mode; follows the leg's stored path when it has one. */
export function legSegments(legs: GuideLeg[]): MapSegment[] {
  return legs.map((l) => ({
    coords: legLinePoints(l).map((p): [number, number] => [p.lng, p.lat]),
    color: modeColor(l.mode),
  }));
}

/** One dashed-line segment per transfer (the transfer walk/ride). */
export function transferSegments(
  legs: GuideLeg[],
  transfers: GuideTransfer[]
): MapSegment[] {
  const legMap = new Map(legs.map((l) => [l.id, l]));
  return transfers.flatMap((c) => {
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
      color: modeColor(c.mode),
    }];
  });
}

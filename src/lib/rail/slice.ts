/**
 * Rail legs follow the track: snap each pin to the nearest station of the
 * leg's mode, slice the line's track between the two stations, and join the
 * slice to the pins. Pure and dependency-free apart from the path codec, so it
 * runs in the browser and in Node tests (ADR 0007).
 *
 * The slice is only as good as the stations: when no single line can be
 * followed it says why, so the builder can keep the straight line and show a
 * mode-specific hint.
 */
import { decodePath, haversineMeters, joinEnds, type LatLng } from "@/lib/map/path";
import { isRailMode, type RailFile, type RailMode } from "./rail-file";

export { isRailMode };
export type { RailMode };

/** A pin snaps to a station only within this distance of one of its stop positions. */
export const RAIL_SNAP_RADIUS_METERS = 250;

/** Why a rail leg has no slice. */
export type RailNoPathReason =
  /** A pin has no station of the mode within the snap radius. */
  | "no-station"
  /** Both pins snap to the same station: nothing to ride. */
  | "same-station"
  /** Each pin has a station, but no line serves both. */
  | "different-lines";

export type RailSliceResult =
  | {
      ok: true;
      /** The slice, starting exactly at `start` and ending exactly at `end`. */
      points: LatLng[];
      /** Id of the line followed (`mrt-3`, `lrt-1`, `lrt-2`). */
      lineId: string;
      fromStation: string;
      toStation: string;
    }
  | { ok: false; reason: RailNoPathReason };

type PreparedDirection = {
  points: LatLng[];
  /** Metres along the chain of each point; same length as `points`. */
  cumulative: number[];
  /** Metres along the chain of each station. */
  at: number[];
};

type PreparedLine = {
  id: string;
  mode: RailMode;
  stations: { name: string; stops: LatLng[] }[];
  directions: PreparedDirection[];
};

/** The rail file with tracks decoded, ready for `sliceRail`. Build once with `prepareRail`. */
export type RailData = { lines: PreparedLine[] };

export function prepareRail(file: RailFile): RailData {
  return {
    lines: file.lines.map((line) => ({
      id: line.id,
      mode: line.mode,
      stations: line.stations.map((station) => ({
        name: station.name,
        stops: station.stops.map(([lat, lng]) => ({ lat, lng })),
      })),
      directions: line.directions.map((direction) => {
        const points = decodePath(direction.path);
        const cumulative = [0];
        for (let i = 1; i < points.length; i++) {
          cumulative.push((cumulative[i - 1] ?? 0) + haversineMeters(points[i - 1]!, points[i]!));
        }
        return { points, cumulative, at: direction.at };
      }),
    })),
  };
}

type Snap = { station: number; distance: number };

/** Nearest station of `line` within the snap radius, by distance to any of its stop positions. */
function snapToLine(line: PreparedLine, pin: LatLng): Snap | null {
  let best: Snap | null = null;
  for (const [index, station] of line.stations.entries()) {
    for (const stop of station.stops) {
      const distance = haversineMeters(pin, stop);
      if (distance <= RAIL_SNAP_RADIUS_METERS && (!best || distance < best.distance)) {
        best = { station: index, distance };
      }
    }
  }
  return best;
}

/** The point `meters` along the chain (clamped to its ends). */
function pointAt(direction: PreparedDirection, meters: number): LatLng {
  const { points, cumulative } = direction;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((cumulative[mid] ?? 0) <= meters) lo = mid;
    else hi = mid - 1;
  }
  const a = points[lo]!;
  const b = points[lo + 1];
  if (!b) return a;
  const from = cumulative[lo] ?? 0;
  const span = (cumulative[lo + 1] ?? from) - from;
  const t = span === 0 ? 0 : Math.min(1, Math.max(0, (meters - from) / span));
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Chain points from `from` to `to` metres (`from < to`), ends interpolated. */
function sliceChain(direction: PreparedDirection, from: number, to: number): LatLng[] {
  const inside = direction.points.filter((_, i) => {
    const m = direction.cumulative[i] ?? 0;
    return m > from && m < to;
  });
  return [pointAt(direction, from), ...inside, pointAt(direction, to)];
}

/**
 * Slices the rail between two pins for a leg of `mode`.
 *
 * Each pin snaps to the nearest station within `RAIL_SNAP_RADIUS_METERS`, per
 * line. Lines serving both pins compete (the `lrt` mode covers LRT-1 and
 * LRT-2, which come within 250 m at Doroteo Jose / Recto); the one with the
 * smallest total snap distance wins, and a line where both pins would snap to
 * the same station only counts when no other shared line is better.
 */
export function sliceRail(rail: RailData, mode: RailMode, start: LatLng, end: LatLng): RailSliceResult {
  const lines = rail.lines.filter((line) => line.mode === mode);
  const snaps = lines.map((line) => ({
    line,
    start: snapToLine(line, start),
    end: snapToLine(line, end),
  }));

  if (!snaps.some((s) => s.start) || !snaps.some((s) => s.end)) {
    return { ok: false, reason: "no-station" };
  }

  let best: { line: PreparedLine; a: Snap; b: Snap } | null = null;
  let sharedLine = false;
  for (const { line, start: a, end: b } of snaps) {
    if (!a || !b) continue;
    sharedLine = true;
    if (a.station === b.station) continue;
    if (!best || a.distance + b.distance < best.a.distance + best.b.distance) best = { line, a, b };
  }
  if (!best) return { ok: false, reason: sharedLine ? "same-station" : "different-lines" };

  const { line, a, b } = best;
  const direction = line.directions.find((d) => (d.at[a.station] ?? 0) < (d.at[b.station] ?? 0));
  if (!direction) return { ok: false, reason: "same-station" };

  const track = sliceChain(direction, direction.at[a.station] ?? 0, direction.at[b.station] ?? 0);
  return {
    ok: true,
    points: joinEnds(track, start, end),
    lineId: line.id,
    fromStation: line.stations[a.station]?.name ?? "",
    toStation: line.stations[b.station]?.name ?? "",
  };
}

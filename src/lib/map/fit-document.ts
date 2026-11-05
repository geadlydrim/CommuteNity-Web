import type { GuideMapData } from "@/lib/schemas/guide-map";
import type { MapData } from "@/lib/schemas/post-map";
import { decodePath, encodePath, joinEnds, simplifyPath, type LatLng } from "./path";

/**
 * Budget for a document's JSON length in UTF-8 bytes. The database CHECK caps
 * `pg_column_size(map_data)` at 16 KiB, but jsonb stores a document larger than
 * its JSON text: every coordinate number, object, and key carries overhead
 * (about 13 bytes per coordinate), while path strings stay about 1:1. Measured:
 * an 8-leg guide with 10 vias per leg is 2.5 KB bigger as jsonb, and a maximal
 * guide about 3 KB. The browser budget therefore leaves about 4 KB of headroom.
 */
export const MAP_DATA_BUDGET_BYTES = 12 * 1024;

export type FitResult<T> = { ok: true; value: T } | { ok: false; reason: "too-large" };

/** Re-simplification steps after the routing endpoint's own 2 m, in metres. */
const FIT_TOLERANCES_METERS = [5, 10, 20] as const;

const encoder = new TextEncoder();

function jsonBytes(doc: unknown): number {
  return encoder.encode(JSON.stringify(doc)).length;
}

/** One stored path with the two pins it must start and end at. */
interface PathSlot {
  path: string | null;
  start: LatLng;
  end: LatLng;
}

/**
 * Shrinks the slots' paths until `build(paths)` fits the budget. Each step
 * (5, then 10, then 20 m) walks the paths longest first, re-simplifying one at
 * a time from its original points and stopping as soon as the document fits,
 * so only as many paths are coarsened as needed. `null` paths are never touched.
 */
function fitPaths<T>(
  doc: T,
  slots: readonly PathSlot[],
  build: (paths: (string | null)[]) => T,
  budgetBytes: number,
): FitResult<T> {
  if (jsonBytes(doc) <= budgetBytes) return { ok: true, value: doc };

  const current = slots.map((slot) => slot.path);
  const originals = slots.map((slot) => (slot.path === null ? null : decodePath(slot.path)));

  for (const tolerance of FIT_TOLERANCES_METERS) {
    const longestFirst = current
      .map((path, index) => ({ index, length: path?.length ?? 0 }))
      .filter((entry) => entry.length > 0)
      .sort((a, b) => b.length - a.length || a.index - b.index);

    for (const { index, length } of longestFirst) {
      const slot = slots[index]!;
      const points = originals[index]!;
      const simplified = encodePath(joinEnds(simplifyPath(points, tolerance), slot.start, slot.end));
      if (simplified.length >= length) continue;

      current[index] = simplified;
      const candidate = build(current);
      if (jsonBytes(candidate) <= budgetBytes) return { ok: true, value: candidate };
    }
  }

  return { ok: false, reason: "too-large" };
}

/** Fits a post map: one path per consecutive pin pair, joined to that pair's pins. */
export function fitPostMap(doc: MapData, budgetBytes: number = MAP_DATA_BUDGET_BYTES): FitResult<MapData> {
  const slots = doc.paths.map((path, i): PathSlot => ({
    path,
    start: doc.pins[i]!,
    end: doc.pins[i + 1]!,
  }));
  return fitPaths(doc, slots, (paths) => ({ ...doc, paths }), budgetBytes);
}

/** Fits a guide: one path per leg, joined to that leg's origin and destination. */
export function fitGuide(doc: GuideMapData, budgetBytes: number = MAP_DATA_BUDGET_BYTES): FitResult<GuideMapData> {
  const slots = doc.legs.map((leg): PathSlot => ({
    path: leg.path,
    start: leg.origin,
    end: leg.destination,
  }));
  return fitPaths(
    doc,
    slots,
    (paths) => ({ ...doc, legs: doc.legs.map((leg, i) => ({ ...leg, path: paths[i] ?? null })) }),
    budgetBytes,
  );
}

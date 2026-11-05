import { describe, expect, it } from "vitest";
import {
  MAP_DATA_BUDGET_BYTES,
  fitGuide,
  fitPostMap,
  type FitResult,
} from "@/lib/map/fit-document";
import { decodePath, encodePath, joinEnds, simplifyPath, type LatLng } from "@/lib/map/path";
import type { GuideMapData } from "@/lib/schemas/guide-map";
import type { MapData, MapPin } from "@/lib/schemas/post-map";
import { spikyRoad } from "../support/street-paths";

// ---------------------------------------------------------------------------
// Fixtures: three stored paths already at the routing endpoint's 2 m.
//
// Spikes sit 200 m apart, so a spike survives a tolerance only while its
// amplitude is bigger: 4 m goes at 5 m, 8 m at 10 m, 14 m at 20 m, 40 m never.
// ---------------------------------------------------------------------------

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

function pinAt(point: LatLng, label: string): MapPin {
  return { lat: round5(point.lat), lng: round5(point.lng), label };
}

function storedRoad(start: LatLng, amplitudes: number[]): { path: string; end: LatLng } {
  const road = spikyRoad(start, amplitudes);
  return { path: encodePath(simplifyPath(road, 2)), end: road[road.length - 1]! };
}

const CLASSES = [4, 8, 14, 40];
const longRoad = storedRoad({ lat: 14.5995, lng: 120.9842 }, Array.from({ length: 20 }, (_, i) => CLASSES[i % 4]!));
const ayala = pinAt({ lat: 14.5547, lng: 121.0244 }, "Ayala");
const mediumRoad = storedRoad(ayala, Array.from({ length: 8 }, (_, i) => CLASSES[i % 4]!));

const PINS: MapPin[] = [
  pinAt({ lat: 14.5995, lng: 120.9842 }, "Quiapo"),
  pinAt(longRoad.end, "Ortigas"),
  ayala,
  pinAt(mediumRoad.end, "Makati"),
];
// Pair 0 has a long path, pair 1 none (a straight line), pair 2 a medium one.
const ORIGINAL_PATHS: (string | null)[] = [longRoad.path, null, mediumRoad.path];

const encoder = new TextEncoder();
const bytes = (doc: unknown) => encoder.encode(JSON.stringify(doc)).length;

/** Every path re-simplified at `tolerance`, computed here independently of the module. */
function simplifiedAt(paths: (string | null)[], tolerance: number): (string | null)[] {
  return paths.map((p) => (p === null ? null : encodePath(simplifyPath(decodePath(p), tolerance))));
}

const pointCount = (path: string | null, tolerance: number) =>
  simplifyPath(decodePath(path!), tolerance).length;

// ---------------------------------------------------------------------------
// Both documents share the behaviour, so one suite runs against each.
// ---------------------------------------------------------------------------

interface Subject<T> {
  name: string;
  make(paths: (string | null)[], pins?: MapPin[]): T;
  fit(doc: T, budgetBytes?: number): FitResult<T>;
  pathsOf(doc: T): (string | null)[];
  /** The document with every path blanked: everything fitting must leave alone. */
  withoutPaths(doc: T): unknown;
}

const postMap: Subject<MapData> = {
  name: "fitPostMap",
  make: (paths, pins = PINS) => ({ version: 2, pins, paths }),
  fit: fitPostMap,
  pathsOf: (doc) => doc.paths,
  withoutPaths: (doc) => ({ ...doc, paths: doc.paths.map(() => null) }),
};

const guide: Subject<GuideMapData> = {
  name: "fitGuide",
  make: (paths, pins = PINS) => ({
    version: 2,
    kind: "guide",
    legs: paths.map((path, i) => ({
      id: `leg-${i}`,
      mode: i === 1 ? "walking" : "bus",
      origin: pins[i]!,
      destination: pins[i + 1]!,
      vias: i === 0 ? [{ lat: 14.6, lng: 121.0 }, { lat: 14.61, lng: 121.01 }] : [],
      expressways: i !== 1,
      path,
    })),
    connectors: [],
  }),
  fit: fitGuide,
  pathsOf: (doc) => doc.legs.map((leg) => leg.path),
  withoutPaths: (doc) => ({ ...doc, legs: doc.legs.map((leg) => ({ ...leg, path: null })) }),
};

function unwrap<T>(result: FitResult<T>): T {
  if (!result.ok) throw new Error(`expected the document to fit, got ${result.reason}`);
  return result.value;
}

describe("the fixtures", () => {
  it("shrink in stages as the tolerance grows, so the steps below are distinguishable", () => {
    const sizes = [2, 5, 10, 20].map((t) => bytes(postMap.make(simplifiedAt(ORIGINAL_PATHS, t))));
    expect(sizes[0]).toBeGreaterThan(sizes[1]!);
    expect(sizes[1]).toBeGreaterThan(sizes[2]!);
    expect(sizes[2]).toBeGreaterThan(sizes[3]!);

    const counts = [2, 5, 10, 20].map((t) => pointCount(longRoad.path, t));
    expect(counts[0]).toBeGreaterThan(counts[1]!);
    expect(counts[1]).toBeGreaterThan(counts[2]!);
    expect(counts[2]).toBeGreaterThan(counts[3]!);
  });
});

describe("MAP_DATA_BUDGET_BYTES", () => {
  it("is 12 KB, leaving headroom under the database's 16 KB CHECK for jsonb's larger storage", () => {
    expect(MAP_DATA_BUDGET_BYTES).toBe(12 * 1024);
  });
});

describe.each([postMap, guide] as Subject<MapData | GuideMapData>[])("$name", (subject) => {
  const doc = subject.make(ORIGINAL_PATHS);

  it("returns a document that fits unchanged", () => {
    const result = subject.fit(doc);

    expect(result.ok).toBe(true);
    expect(unwrap(result)).toBe(doc);
  });

  it("returns a document exactly at the budget unchanged", () => {
    expect(unwrap(subject.fit(doc, bytes(doc)))).toBe(doc);
  });

  it.each([5, 10, 20])("coarsens every path to %i m when that is what the budget needs", (tolerance) => {
    const expected = simplifiedAt(ORIGINAL_PATHS, tolerance);
    const budget = bytes(subject.make(expected));

    const fitted = unwrap(subject.fit(doc, budget));

    expect(subject.pathsOf(fitted)).toEqual(expected);
    expect(bytes(fitted)).toBeLessThanOrEqual(budget);
  });

  it("stops at 5 m when 5 m fits, without going on to 10 m", () => {
    const at5 = simplifiedAt(ORIGINAL_PATHS, 5);
    const fitted = unwrap(subject.fit(doc, bytes(subject.make(at5))));

    const longPath = subject.pathsOf(fitted)[0]!;
    expect(decodePath(longPath)).toHaveLength(pointCount(longRoad.path, 5));
    expect(decodePath(longPath).length).toBeGreaterThan(pointCount(longRoad.path, 10));
  });

  it("coarsens the longest path first and leaves shorter ones alone once it fits", () => {
    const longAt5 = simplifiedAt([longRoad.path], 5)[0]!;
    const budget = bytes(subject.make([longAt5, null, mediumRoad.path]));

    const fitted = unwrap(subject.fit(doc, budget));

    expect(subject.pathsOf(fitted)).toEqual([longAt5, null, mediumRoad.path]);
  });

  it("never touches a null path or anything but the paths", () => {
    const fitted = unwrap(subject.fit(doc, bytes(subject.make(simplifiedAt(ORIGINAL_PATHS, 20)))));

    expect(subject.pathsOf(fitted)[1]).toBeNull();
    expect(subject.withoutPaths(fitted)).toEqual(subject.withoutPaths(doc));
  });

  it("reports too-large when even 20 m does not fit", () => {
    const budget = bytes(subject.make(simplifiedAt(ORIGINAL_PATHS, 20))) - 1;

    expect(subject.fit(doc, budget)).toEqual({ ok: false, reason: "too-large" });
  });

  it("keeps every path starting and ending at its own pins", () => {
    const fitted = unwrap(subject.fit(doc, bytes(subject.make(simplifiedAt(ORIGINAL_PATHS, 20)))));

    subject.pathsOf(fitted).forEach((path, i) => {
      if (path === null) return;
      const points = decodePath(path);
      expect(points[0]).toEqual({ lat: PINS[i]!.lat, lng: PINS[i]!.lng });
      expect(points[points.length - 1]).toEqual({ lat: PINS[i + 1]!.lat, lng: PINS[i + 1]!.lng });
    });
  });

  it("joins a path that stops short of its pins back to them", () => {
    // The router snapped each end about 55 m from the pin.
    const shifted = PINS.map((pin) => ({ ...pin, lat: round5(pin.lat + 0.0005) }));
    const stored = subject.make(ORIGINAL_PATHS, shifted);
    const expected = simplifiedAt(ORIGINAL_PATHS, 20).map((path, i) =>
      path === null ? null : encodePath(joinEnds(decodePath(path), shifted[i]!, shifted[i + 1]!)),
    );
    const budget = bytes(subject.make(expected, shifted));

    const fitted = unwrap(subject.fit(stored, budget));
    expect(subject.pathsOf(fitted)).toEqual(expected);
    subject.pathsOf(fitted).forEach((path, i) => {
      if (path === null) return;
      const points = decodePath(path);
      expect(points[0]).toEqual({ lat: shifted[i]!.lat, lng: shifted[i]!.lng });
      expect(points[points.length - 1]).toEqual({ lat: shifted[i + 1]!.lat, lng: shifted[i + 1]!.lng });
    });
  });
});

describe("a document nothing can shrink under the default budget", () => {
  // Four thousand ±60 m zig-zags: about 20 KB of path at any tolerance up to 20 m.
  const amplitudes = Array.from({ length: 4000 }, (_, i) => (i % 2 === 0 ? 60 : -60));
  const road = spikyRoad({ lat: 14.5995, lng: 120.9842 }, amplitudes, { gapSamples: 1 });
  const pins = [pinAt(road[0]!, "Quiapo"), pinAt(road[road.length - 1]!, "Tuguegarao")];
  const huge = encodePath(simplifyPath(road, 2));

  it("is too large for a post map", () => {
    const doc: MapData = { version: 2, pins, paths: [huge] };

    expect(bytes(doc)).toBeGreaterThan(MAP_DATA_BUDGET_BYTES);
    expect(fitPostMap(doc)).toEqual({ ok: false, reason: "too-large" });
  });

  it("is too large for a guide", () => {
    const doc = guide.make([huge, huge], [pins[0]!, pins[1]!, pins[0]!]);

    expect(fitGuide(doc)).toEqual({ ok: false, reason: "too-large" });
  });
});

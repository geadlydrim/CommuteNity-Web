import { describe, expect, it } from "vitest";
import {
  chainDistanceMeters,
  decodePath,
  decodePath6,
  encodePath,
  haversineMeters,
  joinEnds,
  simplifyPath,
  type LatLng,
} from "@/lib/map/path";

// Google's documented encoded polyline example (precision 5).
const GOOGLE_POINTS: LatLng[] = [
  { lat: 38.5, lng: -120.2 },
  { lat: 40.7, lng: -120.95 },
  { lat: 43.252, lng: -126.453 },
];
const GOOGLE_ENCODED = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
// The same three points at precision 6, from an independent encoder.
const GOOGLE_ENCODED_6 = "_izlhA~rlgdF_{geC~ywl@_kwzCn`{nI";

// Cubao to Quiapo: two points, both precision 5 and 6.
const CUBAO = { lat: 14.62, lng: 121.0529 };
const QUIAPO = { lat: 14.6019, lng: 120.9838 };
const CUBAO_QUIAPO_5 = "_nfxAsczaVbpBznL";
const CUBAO_QUIAPO_6 = "_ui{Zgmn{eFfjb@v}eC";

describe("encodePath / decodePath (precision 5)", () => {
  it("encodes Google's documented example", () => {
    expect(encodePath(GOOGLE_POINTS)).toBe(GOOGLE_ENCODED);
  });

  it("decodes Google's documented example", () => {
    const decoded = decodePath(GOOGLE_ENCODED);

    expect(decoded).toHaveLength(3);
    decoded.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(GOOGLE_POINTS[i]!.lat, 5);
      expect(p.lng).toBeCloseTo(GOOGLE_POINTS[i]!.lng, 5);
    });
  });

  it("round-trips Philippine coordinates", () => {
    expect(encodePath([CUBAO, QUIAPO])).toBe(CUBAO_QUIAPO_5);
    const decoded = decodePath(CUBAO_QUIAPO_5);
    expect(decoded[0]!.lat).toBeCloseTo(14.62, 5);
    expect(decoded[0]!.lng).toBeCloseTo(121.0529, 5);
    expect(decoded[1]!.lat).toBeCloseTo(14.6019, 5);
    expect(decoded[1]!.lng).toBeCloseTo(120.9838, 5);
  });

  it("rounds coordinates to five decimal places when encoding", () => {
    const decoded = decodePath(encodePath([{ lat: 14.6200049, lng: 121.0529051 }]));

    expect(decoded[0]!.lat).toBeCloseTo(14.62, 5);
    expect(decoded[0]!.lng).toBeCloseTo(121.05291, 5);
  });

  it("encodes no points as an empty string and decodes it back", () => {
    expect(encodePath([])).toBe("");
    expect(decodePath("")).toEqual([]);
  });

  it("rejects a truncated string", () => {
    expect(() => decodePath(GOOGLE_ENCODED.slice(0, -1))).toThrow(RangeError);
  });

  it("rejects characters outside the polyline alphabet", () => {
    expect(() => decodePath("_p~iF ~ps|U")).toThrow(RangeError);
  });
});

describe("decodePath6 (Valhalla shapes)", () => {
  it("decodes Google's example written at precision 6", () => {
    const decoded = decodePath6(GOOGLE_ENCODED_6);

    expect(decoded).toHaveLength(3);
    decoded.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(GOOGLE_POINTS[i]!.lat, 6);
      expect(p.lng).toBeCloseTo(GOOGLE_POINTS[i]!.lng, 6);
    });
  });

  it("converts a precision-6 shape to the precision-5 string", () => {
    expect(encodePath(decodePath6(CUBAO_QUIAPO_6))).toBe(CUBAO_QUIAPO_5);
  });
});

describe("haversineMeters / chainDistanceMeters", () => {
  it("measures one degree of latitude as about 111.2 km", () => {
    const d = haversineMeters({ lat: 14, lng: 121 }, { lat: 15, lng: 121 });
    expect(d / 1000).toBeCloseTo(111.2, 0);
  });

  it("measures Cubao to Quiapo as about 8 km", () => {
    expect(haversineMeters(CUBAO, QUIAPO) / 1000).toBeGreaterThan(7.5);
    expect(haversineMeters(CUBAO, QUIAPO) / 1000).toBeLessThan(8.5);
  });

  it("is zero for the same point", () => {
    expect(haversineMeters(CUBAO, CUBAO)).toBe(0);
  });

  it("sums consecutive legs, so a detour counts", () => {
    const a = { lat: 14, lng: 121 };
    const b = { lat: 15, lng: 121 };
    const there = chainDistanceMeters([a, b]);
    expect(chainDistanceMeters([a, b, a])).toBeCloseTo(there * 2, 3);
  });

  it("is zero for fewer than two points", () => {
    expect(chainDistanceMeters([])).toBe(0);
    expect(chainDistanceMeters([CUBAO])).toBe(0);
  });
});

// Independent metre measure for the error-bound check: flat earth around the
// Cubao latitude, accurate to well under a millimetre over a kilometre.
const M_PER_DEG_LAT = 111_195;
const M_PER_DEG_LNG = 111_195 * Math.cos((14.6 * Math.PI) / 180);

function flat(p: LatLng): [number, number] {
  return [p.lng * M_PER_DEG_LNG, p.lat * M_PER_DEG_LAT];
}

function distanceToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const [px, py] = flat(p);
  const [ax, ay] = flat(a);
  const [bx, by] = flat(b);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distanceToPolyline(p: LatLng, line: LatLng[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    best = Math.min(best, distanceToSegment(p, line[i]!, line[i + 1]!));
  }
  return best;
}

describe("simplifyPath (Douglas–Peucker in metres)", () => {
  const ORIGIN: LatLng = { lat: 14.6, lng: 121.0 };
  // A point `east` metres east and `north` metres north of ORIGIN.
  const at = (east: number, north: number): LatLng => ({
    lat: ORIGIN.lat + north / M_PER_DEG_LAT,
    lng: ORIGIN.lng + east / M_PER_DEG_LNG,
  });

  it("returns short paths unchanged", () => {
    expect(simplifyPath([], 2)).toEqual([]);
    expect(simplifyPath([ORIGIN], 2)).toEqual([ORIGIN]);
    expect(simplifyPath([ORIGIN, at(100, 0)], 2)).toEqual([ORIGIN, at(100, 0)]);
  });

  it("drops a point 1 m off the line at a 2 m tolerance", () => {
    const path = [at(0, 0), at(50, 1), at(100, 0)];
    expect(simplifyPath(path, 2)).toEqual([path[0], path[2]]);
  });

  it("keeps a point 5 m off the line at a 2 m tolerance", () => {
    const path = [at(0, 0), at(50, 5), at(100, 0)];
    expect(simplifyPath(path, 2)).toEqual(path);
  });

  it("measures the offset in metres, not degrees, on a north–south line", () => {
    // 3 m east of a line running north: kept at 2 m, dropped at 5 m.
    const path = [at(0, 0), at(3, 50), at(0, 100)];
    expect(simplifyPath(path, 2)).toHaveLength(3);
    expect(simplifyPath(path, 5)).toHaveLength(2);
  });

  it("always keeps the first and last points", () => {
    const path = Array.from({ length: 50 }, (_, i) => at(i * 10, (i % 2) * 0.5));
    const out = simplifyPath(path, 2);
    expect(out[0]).toEqual(path[0]);
    expect(out[out.length - 1]).toEqual(path[path.length - 1]);
  });

  it("keeps every original point within the tolerance of the result", () => {
    // A 2 km winding road: 400 points on a sine wave 30 m high.
    const road = Array.from({ length: 400 }, (_, i) =>
      at(i * 5, 30 * Math.sin((i * 5) / 150)),
    );

    for (const tolerance of [2, 5, 10]) {
      const out = simplifyPath(road, tolerance);
      expect(out.length).toBeLessThan(road.length);
      expect(out.length).toBeGreaterThan(2);
      for (const p of road) {
        expect(distanceToPolyline(p, out)).toBeLessThanOrEqual(tolerance + 0.05);
      }
    }
  });

  it("simplifies a long path without overflowing the stack", () => {
    const long = Array.from({ length: 50_000 }, (_, i) => at(i, 0));
    expect(simplifyPath(long, 2)).toEqual([long[0], long[long.length - 1]]);
  });
});

describe("joinEnds", () => {
  const start = { lat: 14.62, lng: 121.0529 };
  const end = { lat: 14.6019, lng: 120.9838 };

  it("prepends the origin and appends the destination when the snapped ends differ", () => {
    const snapped = [
      { lat: 14.6203, lng: 121.0531 },
      { lat: 14.61, lng: 121.02 },
      { lat: 14.6021, lng: 120.9841 },
    ];

    expect(joinEnds(snapped, start, end)).toEqual([start, ...snapped, end]);
  });

  it("adds nothing at an end that already matches its pin", () => {
    const middle = { lat: 14.61, lng: 121.02 };

    expect(joinEnds([start, middle, end], start, end)).toEqual([start, middle, end]);
  });

  it("treats ends that encode to the same precision-5 point as matching", () => {
    const nearStart = { lat: 14.620002, lng: 121.052898 };
    const out = joinEnds([nearStart, end], start, end);

    expect(out).toHaveLength(2);
    expect(encodePath(out)).toBe(encodePath([start, end]));
  });

  it("joins only the end that differs", () => {
    const snappedEnd = { lat: 14.6021, lng: 120.9841 };

    expect(joinEnds([start, snappedEnd], start, end)).toEqual([start, snappedEnd, end]);
  });

  it("makes a straight line from an empty path", () => {
    expect(joinEnds([], start, end)).toEqual([start, end]);
  });
});

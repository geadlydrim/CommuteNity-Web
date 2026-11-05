import { describe, expect, it } from "vitest";
import { chainDistanceMeters, encodePath, haversineMeters, type LatLng } from "@/lib/map/path";
import { loadRail } from "@/lib/rail/load";
import { railFileSchema } from "@/lib/rail/rail-file";
import { RAIL_SNAP_RADIUS_METERS, prepareRail, sliceRail } from "@/lib/rail/slice";
import railLines from "@/lib/rail/rail-lines.json";
import fixtureJson from "../support/rail-fixture.json";

// A few stations per line cut from the real rail file (see docs/codemap.md → Rail file).
const fixture = prepareRail(railFileSchema.parse(fixtureJson));

// Stop positions copied from the real file: the first stop of each station is
// the stop node of its line's first direction, which lies on that track.
const pin = (lat: number, lng: number): LatLng => ({ lat, lng });
const MRT3 = {
  cubao: pin(14.61948, 121.05106),
  ortigas: pin(14.58734, 121.05652),
  shaw: pin(14.5811, 121.05341),
  boni: pin(14.57309, 121.04764),
  santolan: pin(14.60754, 121.05657),
};
const LRT1 = {
  unitedNations: pin(14.58263, 120.98458),
  centralTerminal: pin(14.59314, 120.98153),
  carriedo: pin(14.59956, 120.98144),
  doroteoJose: pin(14.60534, 120.98205),
  bambang: pin(14.61111, 120.98249),
  tayuman: pin(14.6167, 120.98275),
};
const LRT2 = {
  pureza: pin(14.60171, 121.00504),
  legarda: pin(14.60087, 120.99247),
  recto: pin(14.60364, 120.98309),
};

/** The joined slice reaches `pin`, or a track point that stores as the same point. */
function expectEndsAt(points: readonly LatLng[], start: LatLng, end: LatLng) {
  expect(haversineMeters(points[0]!, start)).toBeLessThan(1);
  expect(haversineMeters(points.at(-1)!, end)).toBeLessThan(1);
}

/** Metres from `p` to the closest vertex of `points`. */
function nearestVertexMeters(points: readonly LatLng[], p: LatLng): number {
  return Math.min(...points.map((q) => haversineMeters(p, q)));
}

/** Index of the vertex of `points` closest to `p`. */
function nearestVertexIndex(points: readonly LatLng[], p: LatLng): number {
  let best = 0;
  points.forEach((q, i) => {
    if (haversineMeters(p, q) < haversineMeters(p, points[best]!)) best = i;
  });
  return best;
}

function ok(result: ReturnType<typeof sliceRail>) {
  if (!result.ok) throw new Error(`expected a slice, got ${result.reason}`);
  return result;
}

describe("sliceRail: station to station", () => {
  it("follows MRT-3 from Cubao to Shaw Boulevard through Santolan and Ortigas", () => {
    const result = ok(sliceRail(fixture, "mrt", MRT3.cubao, MRT3.shaw));

    expect(result.lineId).toBe("mrt-3");
    expect(result.fromStation).toBe("Cubao");
    expect(result.toStation).toBe("Shaw Boulevard");
    expectEndsAt(result.points, MRT3.cubao, MRT3.shaw);
    // Fixture positions: Cubao 150 m, Shaw Boulevard 4744 m along the chain.
    expect(chainDistanceMeters(result.points)).toBeCloseTo(4744 - 150, -2);
    // On the track: through the stops in between, in order.
    expect(nearestVertexMeters(result.points, MRT3.santolan)).toBeLessThan(5);
    expect(nearestVertexMeters(result.points, MRT3.ortigas)).toBeLessThan(5);
    expect(nearestVertexIndex(result.points, MRT3.santolan)).toBeLessThan(
      nearestVertexIndex(result.points, MRT3.ortigas),
    );
  });

  it("follows MRT-3 the other way on the opposite track", () => {
    const result = ok(sliceRail(fixture, "mrt", MRT3.shaw, MRT3.cubao));

    expect(result.fromStation).toBe("Shaw Boulevard");
    expect(result.toStation).toBe("Cubao");
    expect(chainDistanceMeters(result.points)).toBeCloseTo(4744 - 150, -2);
    expect(nearestVertexIndex(result.points, MRT3.ortigas)).toBeLessThan(
      nearestVertexIndex(result.points, MRT3.santolan),
    );
  });

  it("follows LRT-1 from United Nations to Doroteo Jose through Central Terminal and Carriedo", () => {
    const result = ok(sliceRail(fixture, "lrt", LRT1.unitedNations, LRT1.doroteoJose));

    expect(result.lineId).toBe("lrt-1");
    expect(result.fromStation).toBe("United Nations");
    expect(result.toStation).toBe("Doroteo Jose");
    expectEndsAt(result.points, LRT1.unitedNations, LRT1.doroteoJose);
    // Fixture positions: United Nations 150 m, Doroteo Jose 2780 m.
    expect(chainDistanceMeters(result.points)).toBeCloseTo(2780 - 150, -2);
    expect(nearestVertexMeters(result.points, LRT1.centralTerminal)).toBeLessThan(5);
    expect(nearestVertexMeters(result.points, LRT1.carriedo)).toBeLessThan(5);
    expect(nearestVertexIndex(result.points, LRT1.centralTerminal)).toBeLessThan(
      nearestVertexIndex(result.points, LRT1.carriedo),
    );
  });

  it("follows LRT-1 south from Tayuman to Carriedo, the way the train runs", () => {
    const result = ok(sliceRail(fixture, "lrt", LRT1.tayuman, LRT1.carriedo));

    expect(result.lineId).toBe("lrt-1");
    expect(result.fromStation).toBe("Tayuman");
    expect(result.toStation).toBe("Carriedo");
    // Fixture positions on the southbound track: Tayuman 150 m, Carriedo 2122 m.
    // The pins are northbound stop positions, up to 60 m from the southbound ones.
    expect(Math.abs(chainDistanceMeters(result.points) - (2122 - 150))).toBeLessThan(100);
    expect(nearestVertexIndex(result.points, LRT1.bambang)).toBeLessThan(
      nearestVertexIndex(result.points, LRT1.doroteoJose),
    );
  });

  it("follows LRT-2 from Pureza to Recto through Legarda", () => {
    const result = ok(sliceRail(fixture, "lrt", LRT2.pureza, LRT2.recto));

    expect(result.lineId).toBe("lrt-2");
    expect(result.fromStation).toBe("Pureza");
    expect(result.toStation).toBe("Recto");
    // Fixture positions: Pureza 150 m, Recto 2630 m.
    expect(chainDistanceMeters(result.points)).toBeCloseTo(2630 - 150, -2);
    expect(nearestVertexMeters(result.points, LRT2.legarda)).toBeLessThan(5);
  });

  it("snaps pins placed near the station, and joins the slice to the pins", () => {
    // About 150 m east of Cubao and 100 m north of Shaw Boulevard.
    const start = pin(14.61948, 121.05106 + 0.0014);
    const end = pin(14.5811 + 0.0009, 121.05341);
    const result = ok(sliceRail(fixture, "mrt", start, end));

    expect(result.fromStation).toBe("Cubao");
    expect(result.toStation).toBe("Shaw Boulevard");
    expect(result.points[0]).toEqual(start);
    expect(result.points.at(-1)).toEqual(end);
    expect(result.points.length).toBeGreaterThan(4);
    expect(haversineMeters(result.points[1]!, MRT3.cubao)).toBeLessThan(5);
  });

  it("encodes to a short path", () => {
    const result = ok(sliceRail(fixture, "lrt", LRT1.unitedNations, LRT1.tayuman));

    expect(encodePath(result.points).length).toBeLessThan(600);
  });
});

describe("sliceRail: LRT interchange at Doroteo Jose and Recto", () => {
  // Between the two stations: about 110 m from each, so both lines are in range.
  const between = pin(14.6045, 120.98255);

  it("puts the interchange pin on LRT-1 when the other pin is on LRT-1", () => {
    expect(haversineMeters(between, LRT1.doroteoJose)).toBeLessThan(RAIL_SNAP_RADIUS_METERS);
    expect(haversineMeters(between, LRT2.recto)).toBeLessThan(RAIL_SNAP_RADIUS_METERS);

    const result = ok(sliceRail(fixture, "lrt", between, LRT1.carriedo));

    expect(result.lineId).toBe("lrt-1");
    expect(result.fromStation).toBe("Doroteo Jose");
    expect(result.toStation).toBe("Carriedo");
  });

  it("puts the interchange pin on LRT-2 when the other pin is on LRT-2", () => {
    const result = ok(sliceRail(fixture, "lrt", between, LRT2.legarda));

    expect(result.lineId).toBe("lrt-2");
    expect(result.fromStation).toBe("Recto");
    expect(result.toStation).toBe("Legarda");
  });

  it("does not depend on which end the interchange pin is", () => {
    const toBetween = ok(sliceRail(fixture, "lrt", LRT1.bambang, between));

    expect(toBetween.lineId).toBe("lrt-1");
    expect(toBetween.fromStation).toBe("Bambang");
    expect(toBetween.toStation).toBe("Doroteo Jose");
  });
});

describe("sliceRail: no path", () => {
  it("reports no station when the start is beyond 250 m of every station", () => {
    // About 300 m east of Cubao.
    const far = pin(MRT3.cubao.lat, MRT3.cubao.lng + 0.0028);

    expect(haversineMeters(far, MRT3.cubao)).toBeGreaterThan(RAIL_SNAP_RADIUS_METERS);
    expect(sliceRail(fixture, "mrt", far, MRT3.shaw)).toEqual({ ok: false, reason: "no-station" });
  });

  it("reports no station when the end is beyond 250 m of every station", () => {
    const far = pin(MRT3.shaw.lat - 0.003, MRT3.shaw.lng);

    expect(sliceRail(fixture, "mrt", MRT3.cubao, far)).toEqual({ ok: false, reason: "no-station" });
  });

  it("reports no station for pins that are only near stations of another mode", () => {
    expect(sliceRail(fixture, "lrt", MRT3.cubao, MRT3.shaw)).toEqual({ ok: false, reason: "no-station" });
    expect(sliceRail(fixture, "mrt", LRT1.carriedo, LRT1.bambang)).toEqual({ ok: false, reason: "no-station" });
  });

  it("reports the same station when both pins snap to one station", () => {
    // Two pins on opposite sides of Carriedo, 80 m apart.
    const a = pin(LRT1.carriedo.lat + 0.0004, LRT1.carriedo.lng);
    const b = pin(LRT1.carriedo.lat - 0.0003, LRT1.carriedo.lng + 0.0003);

    expect(sliceRail(fixture, "lrt", a, b)).toEqual({ ok: false, reason: "same-station" });
    expect(sliceRail(fixture, "mrt", MRT3.ortigas, MRT3.ortigas)).toEqual({ ok: false, reason: "same-station" });
  });

  it("reports the same station for pins at Doroteo Jose and Recto, which no line separates", () => {
    expect(sliceRail(fixture, "lrt", LRT1.doroteoJose, LRT2.recto)).toEqual({ ok: false, reason: "same-station" });
  });

  it("reports different lines when each pin is on a different LRT line", () => {
    expect(sliceRail(fixture, "lrt", LRT2.legarda, LRT1.bambang)).toEqual({ ok: false, reason: "different-lines" });
    expect(sliceRail(fixture, "lrt", LRT1.tayuman, LRT2.pureza)).toEqual({ ok: false, reason: "different-lines" });
  });
});

describe("the committed rail file", () => {
  const file = railFileSchema.parse(railLines);
  const real = prepareRail(file);

  it("holds MRT-3, LRT-1 and LRT-2 with their published station counts", () => {
    expect(file.lines.map((l) => [l.id, l.mode, l.stations.length, l.directions.length])).toEqual([
      ["mrt-3", "mrt", 13, 2],
      ["lrt-1", "lrt", 25, 2],
      ["lrt-2", "lrt", 13, 2],
    ]);
  });

  it("orders every direction's stations along its track, the two directions reversed", () => {
    for (const line of file.lines) {
      const [first, second] = line.directions;
      const ascending = [...first!.at].sort((a, b) => a - b);
      expect(first!.at).toEqual(ascending);
      expect(second!.at).toEqual([...second!.at].sort((a, b) => b - a));
      for (const direction of line.directions) {
        expect(new Set(direction.at).size).toBe(line.stations.length);
      }
    }
  });

  it("slices between every pair of neighbouring stations, both ways", () => {
    for (const line of file.lines) {
      line.stations.forEach((station, i) => {
        const next = line.stations[i + 1];
        if (!next) return;
        const a = { lat: station.stops[0]![0], lng: station.stops[0]![1] };
        const b = { lat: next.stops[0]![0], lng: next.stops[0]![1] };

        for (const [from, to, fromName, toName] of [
          [a, b, station.name, next.name],
          [b, a, next.name, station.name],
        ] as const) {
          const result = sliceRail(real, line.mode, from, to);
          if (!result.ok) throw new Error(`${line.id} ${fromName} → ${toName}: ${result.reason}`);
          expect([result.lineId, result.fromStation, result.toStation]).toEqual([line.id, fromName, toName]);
          const length = chainDistanceMeters(result.points);
          // Stations on these lines are 561–2,419 m apart by the track; the pins
          // are one direction's stop positions, up to about 200 m from the other's.
          expect(length).toBeGreaterThan(500);
          expect(length).toBeLessThan(2900);
        }
      });
    }
  });

  it("follows LRT-1 from near Carriedo to near Doroteo Jose", () => {
    // About 60 m from each station.
    const start = pin(14.5992, 120.9811);
    const end = pin(14.6058, 120.9824);
    const result = ok(sliceRail(real, "lrt", start, end));

    expect(result.lineId).toBe("lrt-1");
    expect(result.fromStation).toBe("Carriedo");
    expect(result.toStation).toBe("Doroteo Jose");
    expect(result.points[0]).toEqual(start);
    expect(result.points.at(-1)).toEqual(end);
    expect(chainDistanceMeters(result.points)).toBeGreaterThan(600);
    expect(chainDistanceMeters(result.points)).toBeLessThan(900);
  });

  it("slices a full line into a path far under the map-data budget", () => {
    const first = file.lines[1]!.stations[0]!.stops[0]!;
    const last = file.lines[1]!.stations.at(-1)!.stops[0]!;
    const result = ok(
      sliceRail(real, "lrt", { lat: first[0], lng: first[1] }, { lat: last[0], lng: last[1] }),
    );

    expect(result.fromStation).toBe("Dr. Santos");
    expect(result.toStation).toBe("Fernando Poe Jr.");
    expect(chainDistanceMeters(result.points)).toBeGreaterThan(24_000);
    expect(encodePath(result.points).length).toBeLessThan(1_500);
  });

  it("loads once through loadRail", async () => {
    const [a, b] = await Promise.all([loadRail(), loadRail()]);

    expect(a).toBe(b);
    expect(a.lines.map((l) => l.id)).toEqual(["mrt-3", "lrt-1", "lrt-2"]);
  });
});

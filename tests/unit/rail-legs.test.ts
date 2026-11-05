import { describe, expect, it } from "vitest";
import { isRailMode, railHint, railLegOutcome, railLegOutcomes } from "@/components/map/rail-legs";
import { legStretches } from "@/components/map/route-stretches";
import { decodePath, encodePath, haversineMeters, type LatLng } from "@/lib/map/path";
import { railFileSchema } from "@/lib/rail/rail-file";
import { prepareRail } from "@/lib/rail/slice";
import type { TransportMode } from "@/lib/schemas/modes";
import fixtureJson from "../support/rail-fixture.json";

const fixture = prepareRail(railFileSchema.parse(fixtureJson));

const pin = (lat: number, lng: number): LatLng => ({ lat, lng });
// Stop positions copied from the real rail file (as in rail-slice.test.ts).
const CARRIEDO = pin(14.59956, 120.98144);
const DOROTEO_JOSE = pin(14.60534, 120.98205);
const LEGARDA = pin(14.60087, 120.99247);
const BAMBANG = pin(14.61111, 120.98249);
const CUBAO = pin(14.61948, 121.05106);
const SHAW = pin(14.5811, 121.05341);
/** Between Doroteo Jose and Recto, within 250 m of both. */
const INTERCHANGE = pin(14.6045, 120.98255);
/** Well over 250 m from any MRT-3 station. */
const AWAY = pin(CUBAO.lat, CUBAO.lng + 0.01);

describe("railLegOutcome", () => {
  it("gives the slice and its encoded path for an LRT-1 leg from Carriedo to Doroteo Jose", () => {
    const outcome = railLegOutcome(fixture, "lrt", CARRIEDO, DOROTEO_JOSE);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.path).toBe(encodePath(outcome.points));
    // Stored as the leg's path: it decodes to the slice, which starts and ends at the pins.
    const stored = decodePath(outcome.path);
    expect(stored.length).toBeGreaterThan(2);
    expect(haversineMeters(stored[0]!, CARRIEDO)).toBeLessThan(1);
    expect(haversineMeters(stored.at(-1)!, DOROTEO_JOSE)).toBeLessThan(1);
  });

  it("follows the shared line at the LRT interchange", () => {
    const onLrt1 = railLegOutcome(fixture, "lrt", INTERCHANGE, BAMBANG);
    const onLrt2 = railLegOutcome(fixture, "lrt", INTERCHANGE, LEGARDA);

    expect(onLrt1.ok && onLrt2.ok).toBe(true);
    if (!onLrt1.ok || !onLrt2.ok) return;
    expect(onLrt1.path).not.toBe(onLrt2.path);
  });

  it("keeps a straight line with the not-near hint when a pin has no station in range", () => {
    expect(railLegOutcome(fixture, "mrt", AWAY, SHAW)).toEqual({
      ok: false,
      hint: "Not near an MRT station — move the pin to a station to follow the line",
    });
    expect(railLegOutcome(fixture, "lrt", CUBAO, SHAW)).toEqual({
      ok: false,
      hint: "Not near an LRT station — move the pin to a station to follow the line",
    });
  });

  it("explains pins at the same station", () => {
    expect(railLegOutcome(fixture, "lrt", CARRIEDO, pin(CARRIEDO.lat + 0.0003, CARRIEDO.lng))).toEqual({
      ok: false,
      hint: railHint("lrt", "same-station"),
    });
  });

  it("explains pins on different lines", () => {
    expect(railLegOutcome(fixture, "lrt", LEGARDA, BAMBANG)).toEqual({
      ok: false,
      hint: railHint("lrt", "different-lines"),
    });
  });
});

describe("railHint", () => {
  it("names the leg's mode", () => {
    for (const reason of ["no-station", "same-station", "different-lines", "load-failed"] as const) {
      expect(railHint("mrt", reason)).toContain("MRT");
      expect(railHint("mrt", reason)).not.toContain("LRT");
      expect(railHint("lrt", reason)).toContain("LRT");
      expect(railHint("lrt", reason)).not.toContain("MRT");
    }
  });

  it("tells the author to move the pin when no station is near", () => {
    expect(railHint("lrt", "no-station")).toBe(
      "Not near an LRT station — move the pin to a station to follow the line"
    );
  });

  it("says plainly that the rail file did not load", () => {
    expect(railHint("mrt", "load-failed")).toBe("Couldn't load the MRT lines — showing a straight line");
  });

  it("gives every reason its own copy", () => {
    const hints = (["no-station", "same-station", "different-lines", "load-failed"] as const).map((r) =>
      railHint("lrt", r)
    );
    expect(new Set(hints).size).toBe(4);
  });
});

describe("railLegOutcomes", () => {
  const leg = (id: string, mode: TransportMode) => ({ id, mode });
  const ENDS: Record<string, { origin: LatLng | null; destination: LatLng | null }> = {
    walk: { origin: CARRIEDO, destination: DOROTEO_JOSE },
    lrt: { origin: CARRIEDO, destination: DOROTEO_JOSE },
    mrt: { origin: AWAY, destination: SHAW },
    half: { origin: CARRIEDO, destination: null },
  };
  const endsOf = (id: string) => ENDS[id] ?? { origin: null, destination: null };
  const legs = [leg("walk", "walking"), leg("lrt", "lrt"), leg("mrt", "mrt"), leg("half", "lrt")];

  it("covers only rail legs with both ends placed", () => {
    const outcomes = railLegOutcomes(fixture, legs, endsOf);

    expect([...outcomes.keys()]).toEqual(["lrt", "mrt"]);
    expect(outcomes.get("lrt")?.ok).toBe(true);
    expect(outcomes.get("mrt")).toEqual({ ok: false, hint: railHint("mrt", "no-station") });
  });

  it("leaves every rail leg straight with the load-failure hint when the rail file is missing", () => {
    const outcomes = railLegOutcomes(null, legs, endsOf);

    expect(outcomes.get("lrt")).toEqual({ ok: false, hint: railHint("lrt", "load-failed") });
    expect(outcomes.get("mrt")).toEqual({ ok: false, hint: railHint("mrt", "load-failed") });
  });

  it("never hands a rail leg to the router", () => {
    const routed = legStretches(
      legs.map((l) => ({ ...l, expressways: false, vias: [] })),
      endsOf
    );

    expect(routed.map((s) => s.id)).toEqual(["walk"]);
  });
});

describe("isRailMode", () => {
  it("is true for MRT and LRT only", () => {
    expect(isRailMode("mrt")).toBe(true);
    expect(isRailMode("lrt")).toBe(true);
    for (const mode of ["walking", "bus", "jeepney", "uv_express", "p2p", "tricycle"]) {
      expect(isRailMode(mode)).toBe(false);
    }
  });
});

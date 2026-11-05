import { describe, expect, it } from "vitest";
import { legOptions, POST_MAP_PAIR } from "@/lib/schemas/leg-options";
import { TRANSPORT_MODES, type TransportMode } from "@/lib/schemas/modes";

// Expected values come from the spec's "Profiles and options per mode" table.
// Walk and rail have no expressways choice, so their stored default is `false`.
const TABLE: [TransportMode, "walk" | "car" | "rail", boolean][] = [
  ["walking", "walk", false],
  ["jeepney", "car", false],
  ["tricycle", "car", false],
  ["bus", "car", false],
  ["uv_express", "car", true],
  ["p2p", "car", true],
  ["mrt", "rail", false],
  ["lrt", "rail", false],
];

describe("legOptions", () => {
  it.each(TABLE)("%s routes as %s with expressways %s", (mode, profile, expressways) => {
    expect(legOptions(mode)).toEqual({ profile, expressways });
  });

  it("routes a post-map pair as a car with expressways allowed", () => {
    expect(legOptions(POST_MAP_PAIR)).toEqual({ profile: "car", expressways: true });
  });

  it("covers every transport mode exactly once", () => {
    expect(TABLE.map(([mode]) => mode).sort()).toEqual([...TRANSPORT_MODES].sort());
  });
});

import { describe, expect, it } from "vitest";
import { guideChainStatus, type ChainLeg, type ChainTransfer } from "@/lib/schemas/guide-chain";

const pin = { lat: 14.6, lng: 121, label: "Stop" };

function leg(id: string, ends: { origin?: boolean; destination?: boolean } = {}): ChainLeg {
  return {
    id,
    origin: ends.origin === false ? null : pin,
    destination: ends.destination === false ? null : pin,
  };
}

/** A transfer from `from`'s destination to `to`'s origin. */
function transfer(from: string, to: string): ChainTransfer {
  return { from: { legId: from, end: "destination" }, to: { legId: to, end: "origin" } };
}

describe("guideChainStatus", () => {
  it("accepts a single leg with no transfers", () => {
    expect(guideChainStatus([leg("a")], [])).toEqual({ ok: true });
  });

  it("accepts three legs joined in order", () => {
    expect(
      guideChainStatus([leg("a"), leg("b"), leg("c")], [transfer("a", "b"), transfer("b", "c")]),
    ).toEqual({ ok: true });
  });

  it("accepts a chain whose legs are listed out of order", () => {
    expect(
      guideChainStatus([leg("c"), leg("a"), leg("b")], [transfer("b", "c"), transfer("a", "b")]),
    ).toEqual({ ok: true });
  });

  it("reports the first leg missing an origin or destination", () => {
    expect(
      guideChainStatus([leg("a"), leg("b", { destination: false }), leg("c", { origin: false })], []),
    ).toEqual({
      ok: false,
      problem: { kind: "missing-end", leg: 2 },
      message: "Leg 2 needs an origin and a destination.",
    });
  });

  it("reports the first gap between legs without a transfer", () => {
    expect(guideChainStatus([leg("a"), leg("b")], [])).toEqual({
      ok: false,
      problem: { kind: "missing-transfer", between: [1, 2] },
      message: "Add a transfer between legs 1 and 2.",
    });
    expect(guideChainStatus([leg("a"), leg("b"), leg("c")], [transfer("a", "b")])).toEqual({
      ok: false,
      problem: { kind: "missing-transfer", between: [2, 3] },
      message: "Add a transfer between legs 2 and 3.",
    });
  });

  it("reports a leg with two transfers after it", () => {
    expect(
      guideChainStatus([leg("a"), leg("b"), leg("c")], [transfer("a", "b"), transfer("a", "c")]),
    ).toEqual({
      ok: false,
      problem: { kind: "branching", leg: 1, side: "after" },
      message: "Leg 1 has more than one transfer after it. A guide is a single chain.",
    });
  });

  it("reports a leg with two transfers before it", () => {
    expect(
      guideChainStatus([leg("a"), leg("b"), leg("c")], [transfer("a", "c"), transfer("b", "c")]),
    ).toEqual({
      ok: false,
      problem: { kind: "branching", leg: 3, side: "before" },
      message: "Leg 3 has more than one transfer before it. A guide is a single chain.",
    });
  });

  it("reports transfers that loop", () => {
    const cycle = {
      ok: false,
      problem: { kind: "cycle" },
      message: "The transfers loop back on themselves. A guide runs from one start to one end.",
    };
    expect(guideChainStatus([leg("a")], [transfer("a", "a")])).toEqual(cycle);
    expect(
      guideChainStatus([leg("a"), leg("b"), leg("c")], [transfer("a", "b"), transfer("b", "a")]),
    ).toEqual(cycle);
    expect(
      guideChainStatus(
        [leg("a"), leg("b"), leg("c")],
        [transfer("a", "b"), transfer("b", "c"), transfer("c", "a")],
      ),
    ).toEqual(cycle);
  });

  it("reports a transfer that doesn't run from a destination to an origin of a known leg", () => {
    const invalid = {
      ok: false,
      problem: { kind: "invalid-transfer", transfer: 1 },
      message: "Transfer 1 must link one leg's destination to another leg's origin.",
    };
    expect(guideChainStatus([leg("a"), leg("b")], [transfer("a", "z")])).toEqual(invalid);
    expect(
      guideChainStatus(
        [leg("a"), leg("b")],
        [{ from: { legId: "a", end: "origin" }, to: { legId: "b", end: "origin" } }],
      ),
    ).toEqual(invalid);
  });

  it("keeps a repeated leg id off the chain", () => {
    expect(guideChainStatus([leg("a"), leg("a")], [])).toEqual({
      ok: false,
      problem: { kind: "missing-transfer", between: [1, 2] },
      message: "Add a transfer between legs 1 and 2.",
    });
  });
});

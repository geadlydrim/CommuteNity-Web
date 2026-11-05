import { describe, expect, it } from "vitest";
import {
  activeViasOf,
  atViaLimit,
  canUndoVias,
  createReshapeState,
  legPoints,
  nearestInsertIndex,
  reshapeReducer,
  staleViasMessage,
  staleViasNotice,
  viaPointsOf,
  viasOf,
  type ReshapeAction,
  type ReshapeState,
} from "@/components/map/reshape-state";

/** A leg whose path runs east, then north, then east: origin → via 1 → via 2 → destination. */
const ORIGIN = { lat: 14.5, lng: 121.0 };
const VIA_1 = { lat: 14.5, lng: 121.04 };
const VIA_2 = { lat: 14.54, lng: 121.04 };
const DESTINATION = { lat: 14.54, lng: 121.08 };

const LEG = "leg-1";
const OTHER_LEG = "leg-2";

function run(state: ReshapeState, ...actions: ReshapeAction[]): ReshapeState {
  return actions.reduce(reshapeReducer, state);
}

/** A state reshaping LEG (a jeepney leg) that already has VIA_1 and VIA_2. */
function reshapingTwoVias(): ReshapeState {
  return run(createReshapeState([{ id: LEG, vias: [VIA_1, VIA_2] }]), { type: "enter", legId: LEG, mode: "jeepney" });
}

const tap = (point: { lat: number; lng: number }): ReshapeAction => ({
  type: "tap",
  origin: ORIGIN,
  destination: DESTINATION,
  point,
});

describe("nearestInsertIndex", () => {
  const points = [ORIGIN, VIA_1, VIA_2, DESTINATION];

  it("picks the segment nearest the tap, as an index into the via list", () => {
    expect(nearestInsertIndex(points, { lat: 14.498, lng: 121.02 })).toBe(0);
    expect(nearestInsertIndex(points, { lat: 14.52, lng: 121.042 })).toBe(1);
    expect(nearestInsertIndex(points, { lat: 14.542, lng: 121.06 })).toBe(2);
  });

  it("measures to the segment, not to its ends: a tap beside a long segment's middle wins over a nearer endpoint", () => {
    // 0.0005° north of the middle of segment 2 is ~55 m away; via 2 is ~2.2 km from it.
    expect(nearestInsertIndex(points, { lat: 14.5405, lng: 121.06 })).toBe(2);
  });

  it("clamps beyond the ends of the sequence", () => {
    expect(nearestInsertIndex(points, { lat: 14.49, lng: 120.99 })).toBe(0);
    expect(nearestInsertIndex(points, { lat: 14.55, lng: 121.09 })).toBe(2);
  });

  it("inserts at 0 when the leg has no vias", () => {
    expect(nearestInsertIndex([ORIGIN, DESTINATION], { lat: 14.52, lng: 121.04 })).toBe(0);
  });

  it("copes with a degenerate segment (two identical points)", () => {
    expect(nearestInsertIndex([ORIGIN, ORIGIN], { lat: 14.51, lng: 121.01 })).toBe(0);
  });
});

describe("entering and leaving Reshape", () => {
  it("starts with no leg being reshaped", () => {
    expect(createReshapeState().active).toBeNull();
  });

  it("reshapes one leg at a time: entering another leg switches", () => {
    const state = run(
      createReshapeState(),
      { type: "enter", legId: LEG, mode: "jeepney" },
      { type: "enter", legId: OTHER_LEG, mode: "walking" },
    );
    expect(state.active).toBe(OTHER_LEG);
  });

  it("exits with Done", () => {
    const state = run(reshapingTwoVias(), { type: "exit" });
    expect(state.active).toBeNull();
    expect(viasOf(state, LEG)).toEqual([VIA_1, VIA_2]);
  });

  it.each(["mrt", "lrt"] as const)("won't enter Reshape for a %s leg", (mode) => {
    const before = createReshapeState();
    const after = reshapeReducer(before, { type: "enter", legId: "rail-leg", mode });
    expect(after.active).toBeNull();
    expect(after).toBe(before);
  });

  it("keeps reshaping the current leg when a rail leg's Reshape is attempted", () => {
    const state = run(reshapingTwoVias(), { type: "enter", legId: "rail-leg", mode: "lrt" });
    expect(state.active).toBe(LEG);
  });

  it.each(["walking", "jeepney", "tricycle", "bus", "uv_express", "p2p"] as const)("enters Reshape for a %s leg", (mode) => {
    expect(reshapeReducer(createReshapeState(), { type: "enter", legId: LEG, mode }).active).toBe(LEG);
  });
});

describe("tapping the map in Reshape mode", () => {
  it("inserts a via at the nearest segment, keeping the others in order", () => {
    const first = run(reshapingTwoVias(), tap({ lat: 14.498, lng: 121.02 }));
    expect(viasOf(first, LEG)).toEqual([{ lat: 14.498, lng: 121.02 }, VIA_1, VIA_2]);

    const middle = run(reshapingTwoVias(), tap({ lat: 14.52, lng: 121.042 }));
    expect(viasOf(middle, LEG)).toEqual([VIA_1, { lat: 14.52, lng: 121.042 }, VIA_2]);

    const last = run(reshapingTwoVias(), tap({ lat: 14.542, lng: 121.06 }));
    expect(viasOf(last, LEG)).toEqual([VIA_1, VIA_2, { lat: 14.542, lng: 121.06 }]);
  });

  it("measures against the current sequence, including vias added by earlier taps", () => {
    const state = run(
      createReshapeState(),
      { type: "enter", legId: LEG, mode: "walking" },
      tap({ lat: 14.52, lng: 121.04 }),
      // The origin → via 1 segment now runs (14.5, 121.0) → (14.52, 121.04); this tap is beside it.
      tap({ lat: 14.51, lng: 121.015 }),
    );
    expect(viasOf(state, LEG)).toEqual([
      { lat: 14.51, lng: 121.015 },
      { lat: 14.52, lng: 121.04 },
    ]);
  });

  it("does nothing when no leg is being reshaped", () => {
    const before = createReshapeState([{ id: LEG, vias: [VIA_1] }]);
    expect(reshapeReducer(before, tap({ lat: 14.52, lng: 121.04 }))).toBe(before);
  });

  it("is refused at 10 vias, and the state says the limit is reached", () => {
    let state = run(createReshapeState(), { type: "enter", legId: LEG, mode: "bus" });
    for (let i = 0; i < 9; i += 1) {
      state = run(state, tap({ lat: 14.5 + i * 0.001, lng: 121.0 + i * 0.002 }));
    }
    expect(viasOf(state, LEG)).toHaveLength(9);
    expect(atViaLimit(state, LEG)).toBe(false);

    state = run(state, tap({ lat: 14.52, lng: 121.05 }));
    expect(viasOf(state, LEG)).toHaveLength(10);
    expect(atViaLimit(state, LEG)).toBe(true);

    const refused = reshapeReducer(state, tap({ lat: 14.53, lng: 121.06 }));
    expect(refused).toBe(state);
    expect(viasOf(refused, LEG)).toHaveLength(10);
    // The refused tap left no undo entry: one undo takes back the 10th via, not a phantom.
    expect(viasOf(run(refused, { type: "undo", legId: LEG }), LEG)).toHaveLength(9);
  });

  it("is at the limit for a draft reopened with 10 vias", () => {
    const vias = Array.from({ length: 10 }, (_, i) => ({ lat: 14.5 + i * 0.001, lng: 121 }));
    const state = run(createReshapeState([{ id: LEG, vias }]), { type: "enter", legId: LEG, mode: "walking" });
    expect(atViaLimit(state, LEG)).toBe(true);
    expect(reshapeReducer(state, tap({ lat: 14.52, lng: 121.05 }))).toBe(state);
  });
});

describe("moving and removing vias", () => {
  it("moves a via, keeping its place in the order", () => {
    const state = run(reshapingTwoVias(), { type: "moveVia", legId: LEG, index: 0, point: { lat: 14.51, lng: 121.03 } });
    expect(viasOf(state, LEG)).toEqual([{ lat: 14.51, lng: 121.03 }, VIA_2]);
  });

  it("removes a via by its position", () => {
    const state = run(reshapingTwoVias(), { type: "removeVia", legId: LEG, index: 0 });
    expect(viasOf(state, LEG)).toEqual([VIA_2]);
  });

  it("ignores a position that isn't a via", () => {
    const before = reshapingTwoVias();
    expect(reshapeReducer(before, { type: "removeVia", legId: LEG, index: 2 })).toBe(before);
    expect(reshapeReducer(before, { type: "moveVia", legId: LEG, index: 5, point: VIA_1 })).toBe(before);
  });

  it("clears every via", () => {
    const state = run(reshapingTwoVias(), { type: "clearVias", legId: LEG });
    expect(viasOf(state, LEG)).toEqual([]);
  });
});

describe("the point sequence for routing", () => {
  it("is origin, vias in order, destination", () => {
    expect(legPoints(ORIGIN, [VIA_1, VIA_2], DESTINATION)).toEqual([ORIGIN, VIA_1, VIA_2, DESTINATION]);
    expect(legPoints(ORIGIN, [], DESTINATION)).toEqual([ORIGIN, DESTINATION]);
  });

  it("reads the leg's vias out of the state", () => {
    const state = reshapingTwoVias();
    expect(viaPointsOf(state, LEG, ORIGIN, DESTINATION)).toEqual([ORIGIN, VIA_1, VIA_2, DESTINATION]);
    expect(viaPointsOf(state, OTHER_LEG, ORIGIN, DESTINATION)).toEqual([ORIGIN, DESTINATION]);
  });

  it("exposes the active leg's vias, or none when not reshaping", () => {
    expect(activeViasOf(reshapingTwoVias())).toEqual([VIA_1, VIA_2]);
    expect(activeViasOf(createReshapeState())).toEqual([]);
  });
});

describe("pin moves", () => {
  const MANILA = { lat: 14.5995, lng: 120.9842 };
  const move = (from: typeof MANILA | null, to: typeof MANILA, source: "drag" | "search"): ReshapeAction => ({
    type: "pinMoved",
    legId: LEG,
    from,
    to,
    source,
  });

  it("keeps the vias, in order, however far the pin goes", () => {
    const state = run(reshapingTwoVias(), move(MANILA, { lat: 15.4755, lng: 120.5963 }, "drag"));
    expect(viasOf(state, LEG)).toEqual([VIA_1, VIA_2]);
  });

  it("raises the notice after a search pick", () => {
    const state = run(reshapingTwoVias(), move(MANILA, { lat: 14.6, lng: 120.9843 }, "search"));
    expect(staleViasNotice(state, LEG)).toEqual({ viaCount: 2 });
  });

  it("raises the notice after a search pick that placed a pin for the first time", () => {
    const state = run(reshapingTwoVias(), move(null, MANILA, "search"));
    expect(staleViasNotice(state, LEG)).toEqual({ viaCount: 2 });
  });

  it("raises the notice after a drag of more than 1 km (1.1 km)", () => {
    // 0.01° of latitude is about 1,112 m.
    const state = run(reshapingTwoVias(), move(MANILA, { lat: 14.6095, lng: 120.9842 }, "drag"));
    expect(staleViasNotice(state, LEG)).toEqual({ viaCount: 2 });
  });

  it("measures a drag sideways too, not only north-south", () => {
    // 0.0105° of longitude at 14.6°N is about 1,130 m.
    const state = run(reshapingTwoVias(), move(MANILA, { lat: 14.5995, lng: 120.9947 }, "drag"));
    expect(staleViasNotice(state, LEG)).toEqual({ viaCount: 2 });
  });

  it("doesn't raise the notice for a small nudge (900 m)", () => {
    // 0.0081° of latitude is about 901 m.
    const state = run(reshapingTwoVias(), move(MANILA, { lat: 14.6076, lng: 120.9842 }, "drag"));
    expect(staleViasNotice(state, LEG)).toBeNull();
  });

  it("doesn't raise the notice for a drag with no known old position", () => {
    expect(staleViasNotice(run(reshapingTwoVias(), move(null, MANILA, "drag")), LEG)).toBeNull();
  });

  it("raises no notice when the leg has no vias", () => {
    const state = run(
      createReshapeState(),
      { type: "enter", legId: LEG, mode: "jeepney" },
      move(MANILA, { lat: 16.4023, lng: 120.596 }, "drag"),
      move(MANILA, MANILA, "search"),
    );
    expect(staleViasNotice(state, LEG)).toBeNull();
  });

  it("counts the vias the leg has now", () => {
    const state = run(
      reshapingTwoVias(),
      move(MANILA, { lat: 16.4023, lng: 120.596 }, "drag"),
      { type: "removeVia", legId: LEG, index: 1 },
    );
    expect(staleViasNotice(state, LEG)).toEqual({ viaCount: 1 });
  });

  it("leaves another leg's notice alone", () => {
    const state = run(
      createReshapeState([
        { id: LEG, vias: [VIA_1] },
        { id: OTHER_LEG, vias: [VIA_2] },
      ]),
      move(MANILA, { lat: 16.4023, lng: 120.596 }, "drag"),
    );
    expect(staleViasNotice(state, LEG)).toEqual({ viaCount: 1 });
    expect(staleViasNotice(state, OTHER_LEG)).toBeNull();
  });

  it("clears the notice with Clear vias", () => {
    const state = run(
      reshapingTwoVias(),
      move(MANILA, { lat: 16.4023, lng: 120.596 }, "drag"),
      { type: "clearVias", legId: LEG },
    );
    expect(staleViasNotice(state, LEG)).toBeNull();
    expect(viasOf(state, LEG)).toEqual([]);
  });

  it("clears the notice when the last via is removed", () => {
    const state = run(
      reshapingTwoVias(),
      move(MANILA, { lat: 16.4023, lng: 120.596 }, "drag"),
      { type: "removeVia", legId: LEG, index: 0 },
      { type: "removeVia", legId: LEG, index: 0 },
    );
    expect(staleViasNotice(state, LEG)).toBeNull();
  });

  it("clears the notice when Reshape ends, keeping the vias", () => {
    const state = run(reshapingTwoVias(), move(MANILA, { lat: 16.4023, lng: 120.596 }, "drag"), { type: "exit" });
    expect(staleViasNotice(state, LEG)).toBeNull();
    expect(viasOf(state, LEG)).toEqual([VIA_1, VIA_2]);
  });

  it("clears the notice when Reshape moves to another leg", () => {
    const state = run(
      reshapingTwoVias(),
      move(MANILA, { lat: 16.4023, lng: 120.596 }, "drag"),
      { type: "enter", legId: OTHER_LEG, mode: "walking" },
    );
    expect(staleViasNotice(state, LEG)).toBeNull();
  });

  it("words the notice for one via and for several", () => {
    expect(staleViasMessage(1)).toBe("This leg still goes through 1 via placed for the old route");
    expect(staleViasMessage(3)).toBe("This leg still goes through 3 vias placed for the old route");
  });
});

describe("undo", () => {
  const far = { lat: 16.4023, lng: 120.596 };

  it("takes back an added via", () => {
    const state = run(reshapingTwoVias(), tap({ lat: 14.52, lng: 121.042 }), { type: "undo", legId: LEG });
    expect(viasOf(state, LEG)).toEqual([VIA_1, VIA_2]);
  });

  it("takes back a moved via", () => {
    const state = run(
      reshapingTwoVias(),
      { type: "moveVia", legId: LEG, index: 1, point: { lat: 14.55, lng: 121.05 } },
      { type: "undo", legId: LEG },
    );
    expect(viasOf(state, LEG)).toEqual([VIA_1, VIA_2]);
  });

  it("takes back a removed via, in its old place", () => {
    const state = run(reshapingTwoVias(), { type: "removeVia", legId: LEG, index: 0 }, { type: "undo", legId: LEG });
    expect(viasOf(state, LEG)).toEqual([VIA_1, VIA_2]);
  });

  it("takes back Clear all", () => {
    const state = run(reshapingTwoVias(), { type: "clearVias", legId: LEG }, { type: "undo", legId: LEG });
    expect(viasOf(state, LEG)).toEqual([VIA_1, VIA_2]);
  });

  it("takes back Clear vias from the notice", () => {
    const state = run(
      reshapingTwoVias(),
      { type: "pinMoved", legId: LEG, from: ORIGIN, to: far, source: "drag" },
      { type: "clearVias", legId: LEG },
      { type: "undo", legId: LEG },
    );
    expect(viasOf(state, LEG)).toEqual([VIA_1, VIA_2]);
  });

  it("steps back one change at a time", () => {
    const state = run(
      reshapingTwoVias(),
      tap({ lat: 14.52, lng: 121.042 }),
      { type: "removeVia", legId: LEG, index: 0 },
      { type: "undo", legId: LEG },
    );
    expect(viasOf(state, LEG)).toEqual([VIA_1, { lat: 14.52, lng: 121.042 }, VIA_2]);
    expect(viasOf(run(state, { type: "undo", legId: LEG }), LEG)).toEqual([VIA_1, VIA_2]);
  });

  it("has nothing to undo at the start, and when the stack runs out", () => {
    const start = reshapingTwoVias();
    expect(canUndoVias(start, LEG)).toBe(false);
    expect(reshapeReducer(start, { type: "undo", legId: LEG })).toBe(start);

    const edited = run(start, { type: "removeVia", legId: LEG, index: 0 });
    expect(canUndoVias(edited, LEG)).toBe(true);
    expect(canUndoVias(run(edited, { type: "undo", legId: LEG }), LEG)).toBe(false);
  });

  it("doesn't undo pin moves: they leave nothing to undo", () => {
    const state = run(reshapingTwoVias(), { type: "pinMoved", legId: LEG, from: ORIGIN, to: far, source: "search" });
    expect(canUndoVias(state, LEG)).toBe(false);
    expect(viasOf(run(state, { type: "undo", legId: LEG }), LEG)).toEqual([VIA_1, VIA_2]);
  });

  it("undoes only the via change, not a pin move made between", () => {
    const state = run(
      reshapingTwoVias(),
      { type: "removeVia", legId: LEG, index: 0 },
      { type: "pinMoved", legId: LEG, from: ORIGIN, to: far, source: "drag" },
      { type: "undo", legId: LEG },
    );
    // The vias come back; the pin stays where it moved (the state never held it).
    expect(viasOf(state, LEG)).toEqual([VIA_1, VIA_2]);
  });

  it("keeps a separate stack per leg", () => {
    const state = run(
      createReshapeState([
        { id: LEG, vias: [VIA_1] },
        { id: OTHER_LEG, vias: [VIA_2] },
      ]),
      { type: "removeVia", legId: LEG, index: 0 },
      { type: "removeVia", legId: OTHER_LEG, index: 0 },
      { type: "undo", legId: LEG },
    );
    expect(viasOf(state, LEG)).toEqual([VIA_1]);
    expect(viasOf(state, OTHER_LEG)).toEqual([]);
    expect(canUndoVias(state, OTHER_LEG)).toBe(true);
  });

  it("keeps the 50 most recent changes", () => {
    let state = reshapingTwoVias();
    for (let i = 0; i < 60; i += 1) {
      state = run(state, { type: "moveVia", legId: LEG, index: 0, point: { lat: 14.5, lng: 121.01 + i * 0.0001 } });
    }
    let undone = 0;
    while (canUndoVias(state, LEG)) {
      state = run(state, { type: "undo", legId: LEG });
      undone += 1;
    }
    expect(undone).toBe(50);
  });
});

describe("syncing with the guide's legs", () => {
  it("drops the vias, history, and notice of a leg that is gone, and ends Reshape on it", () => {
    const edited = run(reshapingTwoVias(), { type: "removeVia", legId: LEG, index: 0 });
    const state = run(edited, { type: "sync", legs: [{ id: OTHER_LEG, mode: "walking" }] });
    expect(state.active).toBeNull();
    expect(viasOf(state, LEG)).toEqual([]);
    expect(canUndoVias(state, LEG)).toBe(false);
  });

  it("drops the vias of a leg whose mode became rail, and ends Reshape on it", () => {
    const state = run(reshapingTwoVias(), { type: "sync", legs: [{ id: LEG, mode: "mrt" }] });
    expect(state.active).toBeNull();
    expect(viasOf(state, LEG)).toEqual([]);
  });

  it("keeps everything for legs that are still road or walking legs", () => {
    const before = reshapingTwoVias();
    const after = reshapeReducer(before, { type: "sync", legs: [{ id: LEG, mode: "bus" }] });
    expect(after).toBe(before);
  });
});

describe("seeding from a reopened draft", () => {
  it("starts with the draft's vias, no history, and no Reshape", () => {
    const state = createReshapeState([
      { id: LEG, vias: [VIA_1, VIA_2] },
      { id: OTHER_LEG, vias: [] },
    ]);
    expect(viasOf(state, LEG)).toEqual([VIA_1, VIA_2]);
    expect(viasOf(state, OTHER_LEG)).toEqual([]);
    expect(canUndoVias(state, LEG)).toBe(false);
    expect(state.active).toBeNull();
  });
});

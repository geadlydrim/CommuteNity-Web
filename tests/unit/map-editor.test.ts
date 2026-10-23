import { describe, expect, it } from "vitest";
import {
  OUTSIDE_PHILIPPINES,
  createEditorState,
  mapEditorReducer,
  placementRefusal,
  type MapEditorState,
} from "@/components/map/map-editor-state";

const MANILA = { lat: 14.5995, lng: 120.9842 };
const ANGELES = { lat: 15.145, lng: 120.5887 };
const TAIPEI = { lat: 25.033, lng: 121.5654 };

function place(state: MapEditorState, key: string, at: { lat: number; lng: number }, token: number) {
  return mapEditorReducer(state, { type: "place", key, token, ...at });
}

function located(state: MapEditorState, key: string, token: number, displayName: string) {
  return mapEditorReducer(state, {
    type: "located",
    key,
    token,
    place: { displayName, secondaryName: "Metro Manila", lat: 0, lon: 0 },
  });
}

const empty = () =>
  createEditorState([
    { key: "origin", pin: null },
    { key: "destination", pin: null },
  ]);

describe("map editor placement", () => {
  it("sets coordinates and a pending label for an in-bounds placement", () => {
    const slot = place(empty(), "origin", MANILA, 1).slots.get("origin");
    expect(slot).toMatchObject({ ...MANILA, label: "", sublabel: "", token: 1, locating: true });
  });

  it("labels the slot with the reverse-geocode result for its latest placement", () => {
    const state = located(place(empty(), "origin", MANILA, 1), "origin", 1, "Quiapo Church");
    expect(state.slots.get("origin")).toMatchObject({
      ...MANILA,
      label: "Quiapo Church",
      sublabel: "Metro Manila",
      locating: false,
    });
  });

  it("ignores an older reverse-geocode result after a newer placement and applies the newer one", () => {
    let state = place(empty(), "origin", MANILA, 1);
    state = place(state, "origin", ANGELES, 2);

    state = located(state, "origin", 1, "Quiapo Church");
    expect(state.slots.get("origin")).toMatchObject({ ...ANGELES, label: "", locating: true });

    state = located(state, "origin", 2, "Clark Freeport");
    expect(state.slots.get("origin")).toMatchObject({ ...ANGELES, label: "Clark Freeport", locating: false });

    // A late answer for the first drop still can't relabel it.
    state = located(state, "origin", 1, "Quiapo Church");
    expect(state.slots.get("origin")?.label).toBe("Clark Freeport");
  });

  it("labels a failed lookup with its coordinates", () => {
    let state = place(empty(), "origin", MANILA, 1);
    state = mapEditorReducer(state, { type: "located", key: "origin", token: 1, place: null });
    expect(state.slots.get("origin")).toMatchObject({ label: "14.5995, 120.9842", locating: false });
  });

  it("leaves other slots alone when a result arrives for one slot", () => {
    let state = place(empty(), "origin", MANILA, 1);
    state = place(state, "destination", ANGELES, 2);
    const destination = state.slots.get("destination");

    state = located(state, "origin", 1, "Quiapo Church");
    expect(state.slots.get("destination")).toBe(destination);

    // A result carrying another slot's token doesn't label this one.
    state = located(state, "destination", 1, "Quiapo Church");
    expect(state.slots.get("destination")).toBe(destination);
  });

  it("refuses a placement outside the Philippines and leaves the slot unchanged", () => {
    const before = place(empty(), "origin", MANILA, 1);
    const after = place(before, "origin", TAIPEI, 2);
    expect(after).toBe(before);
    expect(after.slots.get("origin")).toMatchObject({ ...MANILA, token: 1 });
    expect(placementRefusal(TAIPEI.lat, TAIPEI.lng)).toBe(OUTSIDE_PHILIPPINES);
    expect(placementRefusal(MANILA.lat, MANILA.lng)).toBeNull();
  });

  it("refuses a search pick outside the Philippines", () => {
    const before = empty();
    const after = mapEditorReducer(before, {
      type: "pick",
      key: "origin",
      token: 1,
      result: { displayName: "Taipei 101", lat: TAIPEI.lat, lon: TAIPEI.lng },
    });
    expect(after).toBe(before);
  });
});

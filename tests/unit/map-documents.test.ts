import { describe, expect, it } from "vitest";
import { parsePostMap } from "@/lib/schemas/post-map";
import { parseGuide } from "@/lib/schemas/guide-map";

const cubao = { lat: 14.6196, lng: 121.0537, label: "Cubao", sublabel: "Quezon City" };
const ayala = { lat: 14.5491, lng: 121.0279, label: "Ayala" };
const quiapo = { lat: 14.5986, lng: 120.9837, label: "Quiapo", sublabel: "Manila" };

const postMapV1 = { version: 1, pins: [cubao, ayala] };
const postMapV2 = { version: 2, pins: [cubao, ayala], paths: [null] };

const transferAB = {
  id: "t1",
  mode: "walking",
  from: { legId: "a", end: "destination" },
  to: { legId: "b", end: "origin" },
};

const guideV1 = {
  version: 1,
  kind: "guide",
  legs: [
    { id: "a", mode: "bus", origin: cubao, destination: ayala },
    { id: "b", mode: "jeepney", origin: ayala, destination: quiapo },
  ],
  connectors: [transferAB],
};

const legA = {
  id: "a",
  mode: "bus",
  origin: cubao,
  destination: ayala,
  vias: [],
  expressways: false,
  path: null,
};
const legB = {
  id: "b",
  mode: "uv_express",
  origin: ayala,
  destination: quiapo,
  vias: [{ lat: 14.58, lng: 121.0 }],
  expressways: true,
  path: "_p~iF~ps|U_ulLnnqC",
};

const guideV2 = { version: 2, kind: "guide", legs: [legA, legB], connectors: [transferAB] };

describe("parsePostMap", () => {
  it("migrates a version 1 post map to version 2 with a null path per pin pair", () => {
    expect(parsePostMap(postMapV1)).toEqual({ status: "ok", map: postMapV2 });
  });

  it("gives a three-pin version 1 post map two null paths", () => {
    expect(parsePostMap({ version: 1, pins: [cubao, ayala, quiapo] })).toEqual({
      status: "ok",
      map: { version: 2, pins: [cubao, ayala, quiapo], paths: [null, null] },
    });
  });

  it("round-trips a version 2 post map with stored paths", () => {
    const doc = { version: 2, pins: [cubao, ayala, quiapo], paths: ["_p~iF~ps|U", null] };
    expect(parsePostMap(doc)).toEqual({ status: "ok", map: doc });
  });

  it("reports a newer version instead of calling it invalid", () => {
    expect(parsePostMap({ version: 3, pins: [cubao, ayala], paths: [null] })).toEqual({
      status: "unknown-version",
      version: 3,
    });
    expect(parsePostMap({ version: 7, route: "anything" })).toEqual({
      status: "unknown-version",
      version: 7,
    });
  });

  it("rejects a paths array that isn't one entry per pin pair", () => {
    expect(parsePostMap({ ...postMapV2, paths: [] })).toEqual({ status: "invalid" });
    expect(parsePostMap({ ...postMapV2, paths: [null, null] })).toEqual({ status: "invalid" });
    expect(parsePostMap({ version: 2, pins: [cubao, ayala, quiapo], paths: [null] })).toEqual({
      status: "invalid",
    });
    expect(parsePostMap({ version: 2, pins: [cubao, ayala] })).toEqual({ status: "invalid" });
  });

  it("rejects a path that is neither an encoded string nor null", () => {
    expect(parsePostMap({ ...postMapV2, paths: [42] })).toEqual({ status: "invalid" });
    expect(parsePostMap({ ...postMapV2, paths: [""] })).toEqual({ status: "invalid" });
  });

  it("rejects malformed documents", () => {
    expect(parsePostMap({ version: 1, pins: [cubao] })).toEqual({ status: "invalid" });
    expect(parsePostMap({ version: 1, pins: [cubao, { ...ayala, lat: 40 }] })).toEqual({
      status: "invalid",
    });
    expect(parsePostMap({ ...postMapV2, pins: [cubao, { ...ayala, lat: 40 }] })).toEqual({
      status: "invalid",
    });
    expect(parsePostMap({ pins: [cubao, ayala] })).toEqual({ status: "invalid" });
    expect(parsePostMap({ version: "2", pins: [cubao, ayala] })).toEqual({ status: "invalid" });
    expect(parsePostMap({ version: 0, pins: [cubao, ayala] })).toEqual({ status: "invalid" });
    expect(parsePostMap("map")).toEqual({ status: "invalid" });
  });

  it("reports no map for null or undefined", () => {
    expect(parsePostMap(null)).toEqual({ status: "none" });
    expect(parsePostMap(undefined)).toEqual({ status: "none" });
  });
});

describe("parseGuide", () => {
  it("migrates a version 1 guide: empty vias, mode-default expressways, null path", () => {
    expect(parseGuide(guideV1)).toEqual({
      status: "ok",
      map: {
        version: 2,
        kind: "guide",
        legs: [
          { id: "a", mode: "bus", origin: cubao, destination: ayala, vias: [], expressways: false, path: null },
          { id: "b", mode: "jeepney", origin: ayala, destination: quiapo, vias: [], expressways: false, path: null },
        ],
        connectors: [transferAB],
      },
    });
  });

  it("sets each migrated leg's expressways to its own mode's default", () => {
    const modes = ["uv_express", "p2p", "bus", "tricycle", "walking", "mrt"] as const;
    const legs = modes.map((mode, i) => ({
      id: `l${i}`,
      mode,
      origin: i % 2 === 0 ? cubao : ayala,
      destination: i % 2 === 0 ? ayala : cubao,
    }));
    const connectors = legs.slice(1).map((leg, i) => ({
      id: `t${i}`,
      mode: "walking",
      from: { legId: `l${i}`, end: "destination" },
      to: { legId: leg.id, end: "origin" },
    }));
    const parsed = parseGuide({ version: 1, kind: "guide", legs, connectors });
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") return;
    expect(parsed.map.legs.map((l) => [l.mode, l.expressways])).toEqual([
      ["uv_express", true],
      ["p2p", true],
      ["bus", false],
      ["tricycle", false],
      ["walking", false],
      ["mrt", false],
    ]);
  });

  it("fills in missing connectors on a one-leg version 1 guide", () => {
    const [firstLeg] = guideV1.legs;
    expect(parseGuide({ version: 1, kind: "guide", legs: [firstLeg] })).toEqual({
      status: "ok",
      map: {
        version: 2,
        kind: "guide",
        legs: [{ ...firstLeg, vias: [], expressways: false, path: null }],
        connectors: [],
      },
    });
  });

  it("round-trips a version 2 guide with vias, a path, and a flipped expressways switch", () => {
    expect(parseGuide(guideV2)).toEqual({ status: "ok", map: guideV2 });
  });

  it("accepts exactly 10 vias on a leg", () => {
    const vias = Array.from({ length: 10 }, (_, i) => ({ lat: 14.5 + i * 0.01, lng: 121 }));
    const doc = { ...guideV2, legs: [{ ...legA, vias }, legB] };
    expect(parseGuide(doc)).toEqual({ status: "ok", map: doc });
  });

  it("reports a newer version instead of calling it invalid", () => {
    expect(parseGuide({ ...guideV2, version: 3 })).toEqual({
      status: "unknown-version",
      version: 3,
    });
  });

  it("rejects more than 10 vias on a leg", () => {
    const vias = Array.from({ length: 11 }, (_, i) => ({ lat: 14.5 + i * 0.01, lng: 121 }));
    expect(parseGuide({ ...guideV2, legs: [{ ...legA, vias }, legB] })).toEqual({
      status: "invalid",
    });
  });

  it("rejects a via outside the Philippine bounds", () => {
    for (const via of [
      { lat: 3.9, lng: 121 },
      { lat: 21.1, lng: 121 },
      { lat: 14.5, lng: 115.9 },
      { lat: 14.5, lng: 127.1 },
    ]) {
      expect(parseGuide({ ...guideV2, legs: [{ ...legA, vias: [via] }, legB] })).toEqual({
        status: "invalid",
      });
    }
  });

  it("rejects a version 2 leg missing its path fields or with the wrong types", () => {
    const without = (key: "vias" | "expressways" | "path") =>
      Object.fromEntries(Object.entries(legA).filter(([k]) => k !== key));
    for (const leg of [
      without("vias"),
      without("expressways"),
      without("path"),
      { ...legA, expressways: "yes" },
      { ...legA, path: 12 },
      { ...legA, path: "" },
    ]) {
      expect(parseGuide({ ...guideV2, legs: [leg, legB] })).toEqual({ status: "invalid" });
    }
  });

  it("rejects malformed documents", () => {
    expect(parseGuide({ ...guideV1, connectors: [] })).toEqual({ status: "invalid" });
    expect(parseGuide({ ...guideV1, kind: "post" })).toEqual({ status: "invalid" });
    expect(parseGuide({ ...guideV1, legs: [] })).toEqual({ status: "invalid" });
    expect(parseGuide({ ...guideV2, connectors: [] })).toEqual({ status: "invalid" });
    expect(parseGuide({ ...guideV2, legs: [] })).toEqual({ status: "invalid" });
    expect(parseGuide(postMapV1)).toEqual({ status: "invalid" });
    expect(parseGuide(postMapV2)).toEqual({ status: "invalid" });
    expect(parseGuide([guideV1])).toEqual({ status: "invalid" });
  });

  it("reports no guide for null or undefined", () => {
    expect(parseGuide(null)).toEqual({ status: "none" });
    expect(parseGuide(undefined)).toEqual({ status: "none" });
  });
});

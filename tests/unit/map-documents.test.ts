import { describe, expect, it } from "vitest";
import { parsePostMap } from "@/lib/schemas/post-map";
import { parseGuide } from "@/lib/schemas/guide-map";

const cubao = { lat: 14.6196, lng: 121.0537, label: "Cubao", sublabel: "Quezon City" };
const ayala = { lat: 14.5491, lng: 121.0279, label: "Ayala" };
const quiapo = { lat: 14.5986, lng: 120.9837, label: "Quiapo", sublabel: "Manila" };

const postMapV1 = { version: 1, pins: [cubao, ayala] };

const guideV1 = {
  version: 1,
  kind: "guide",
  legs: [
    { id: "a", mode: "bus", origin: cubao, destination: ayala },
    { id: "b", mode: "jeepney", origin: ayala, destination: quiapo },
  ],
  connectors: [
    {
      id: "t1",
      mode: "walking",
      from: { legId: "a", end: "destination" },
      to: { legId: "b", end: "origin" },
    },
  ],
};

describe("parsePostMap", () => {
  it("parses a version 1 post map unchanged", () => {
    expect(parsePostMap(postMapV1)).toEqual({ status: "ok", map: postMapV1 });
  });

  it("reports a newer version instead of calling it invalid", () => {
    expect(parsePostMap({ version: 2, pins: [cubao, ayala] })).toEqual({
      status: "unknown-version",
      version: 2,
    });
    expect(parsePostMap({ version: 7, route: "anything" })).toEqual({
      status: "unknown-version",
      version: 7,
    });
  });

  it("rejects malformed documents", () => {
    expect(parsePostMap({ version: 1, pins: [cubao] })).toEqual({ status: "invalid" });
    expect(parsePostMap({ version: 1, pins: [cubao, { ...ayala, lat: 40 }] })).toEqual({
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
  it("parses a version 1 guide unchanged", () => {
    expect(parseGuide(guideV1)).toEqual({ status: "ok", map: guideV1 });
  });

  it("fills in missing connectors on a one-leg version 1 guide", () => {
    const [firstLeg] = guideV1.legs;
    expect(parseGuide({ version: 1, kind: "guide", legs: [firstLeg] })).toEqual({
      status: "ok",
      map: { version: 1, kind: "guide", legs: [firstLeg], connectors: [] },
    });
  });

  it("reports a newer version instead of calling it invalid", () => {
    expect(parseGuide({ ...guideV1, version: 2 })).toEqual({
      status: "unknown-version",
      version: 2,
    });
  });

  it("rejects malformed documents", () => {
    expect(parseGuide({ ...guideV1, connectors: [] })).toEqual({ status: "invalid" });
    expect(parseGuide({ ...guideV1, kind: "post" })).toEqual({ status: "invalid" });
    expect(parseGuide({ ...guideV1, legs: [] })).toEqual({ status: "invalid" });
    expect(parseGuide(postMapV1)).toEqual({ status: "invalid" });
    expect(parseGuide([guideV1])).toEqual({ status: "invalid" });
  });

  it("reports no guide for null or undefined", () => {
    expect(parseGuide(null)).toEqual({ status: "none" });
    expect(parseGuide(undefined)).toEqual({ status: "none" });
  });
});

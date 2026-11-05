import { describe, expect, it } from "vitest";
import {
  fitPinsToView,
  fitPointsToView,
  fitPostMapToView,
  lineStringFromPoints,
  pairLinePoints,
  pointBounds,
  postMapFramingPoints,
  postMapLinePoints,
  worldX,
  worldY,
} from "@/components/map/post-map-geometry";
import {
  guideAllPins,
  guideFramingPoints,
  guideMapFit,
  legLinePoints,
  legSegments,
  transferSegments,
} from "@/components/map/guide-geometry";
import { encodePath, type LatLng } from "@/lib/map/path";
import type { GuideLeg, GuideTransfer } from "@/lib/schemas/guide-map";
import type { MapData, MapPin } from "@/lib/schemas/post-map";

const WIDTH = 600;
const HEIGHT = 240;
const PAD_PX = 32;

const QUIAPO: MapPin = { lat: 14.5995, lng: 120.9842, label: "Quiapo" };
const CUBAO: MapPin = { lat: 14.6197, lng: 121.0527, label: "Cubao" };
const MAKATI: MapPin = { lat: 14.5547, lng: 121.0244, label: "Ayala" };

/** Do all points fit inside the padded viewport at this zoom? */
function fits(pins: readonly LatLng[], zoom: number): boolean {
  const xs = pins.map((p) => worldX(p.lng, zoom));
  const ys = pins.map((p) => worldY(p.lat, zoom));
  return (
    Math.max(...xs) - Math.min(...xs) <= WIDTH - 2 * PAD_PX &&
    Math.max(...ys) - Math.min(...ys) <= HEIGHT - 2 * PAD_PX
  );
}

describe("Web Mercator projection", () => {
  it("puts lng 0 / lat 0 at the middle of the world", () => {
    expect(worldX(0, 0)).toBe(128);
    expect(worldY(0, 0)).toBeCloseTo(128, 9);
    expect(worldX(0, 3)).toBe(1024);
  });

  it("spans the full world width from -180 to 180", () => {
    expect(worldX(-180, 2)).toBe(0);
    expect(worldX(180, 2)).toBe(1024);
  });

  it("grows y southward", () => {
    expect(worldY(QUIAPO.lat, 14)).toBeLessThan(worldY(MAKATI.lat, 14));
  });
});

describe("fitPinsToView", () => {
  it("centres two pins at the tightest zoom that still fits them", () => {
    const fit = fitPinsToView([QUIAPO, CUBAO], WIDTH, HEIGHT);

    expect(fit.longitude).toBeCloseTo((QUIAPO.lng + CUBAO.lng) / 2, 9);
    expect(fit.latitude).toBeCloseTo((QUIAPO.lat + CUBAO.lat) / 2, 9);
    expect(Number.isInteger(fit.zoom)).toBe(true);
    expect(fits([QUIAPO, CUBAO], fit.zoom)).toBe(true);
    expect(fits([QUIAPO, CUBAO], fit.zoom + 1)).toBe(false);
  });

  it("centres a single pin at a street-level zoom", () => {
    expect(fitPinsToView([QUIAPO], WIDTH, HEIGHT)).toEqual({
      longitude: QUIAPO.lng,
      latitude: QUIAPO.lat,
      zoom: 14,
    });
  });

  it("treats two identical pins like one, with no NaN or Infinity", () => {
    const fit = fitPinsToView([QUIAPO, { ...QUIAPO, label: "Same spot" }], WIDTH, HEIGHT);

    expect(fit).toEqual({ longitude: QUIAPO.lng, latitude: QUIAPO.lat, zoom: 14 });
    expect(Number.isFinite(worldX(fit.longitude, fit.zoom))).toBe(true);
    expect(Number.isFinite(worldY(fit.latitude, fit.zoom))).toBe(true);
  });

  it("falls back to Metro Manila with no pins", () => {
    expect(fitPinsToView([], WIDTH, HEIGHT)).toEqual({
      longitude: 120.9842,
      latitude: 14.5995,
      zoom: 11,
    });
  });
});

// A street path from Quiapo to Cubao that swings south of and east past both pins.
const BULGE: LatLng[] = [
  { lat: 14.5995, lng: 120.9842 },
  { lat: 14.5, lng: 121.0 },
  { lat: 14.52, lng: 121.2 },
  { lat: 14.6197, lng: 121.0527 },
];

const postMap = (pins: MapPin[], paths: (string | null)[]): MapData => ({
  version: 2,
  pins,
  paths,
});

describe("pointBounds", () => {
  it("is the smallest box around the points", () => {
    expect(pointBounds(BULGE)).toEqual({
      minLat: 14.5,
      maxLat: 14.6197,
      minLng: 120.9842,
      maxLng: 121.2,
    });
  });

  it("is null with no points", () => {
    expect(pointBounds([])).toBeNull();
  });
});

describe("post map framing", () => {
  it("includes path points beyond the pins", () => {
    const map = postMap([QUIAPO, CUBAO], [encodePath(BULGE)]);
    const bounds = pointBounds(postMapFramingPoints(map));

    expect(bounds).not.toBeNull();
    expect(bounds!.minLat).toBeCloseTo(14.5, 9);
    expect(bounds!.maxLat).toBeCloseTo(14.6197, 9);
    expect(bounds!.minLng).toBeCloseTo(120.9842, 9);
    expect(bounds!.maxLng).toBeCloseTo(121.2, 9);
  });

  it("lets a null pair contribute only its pins", () => {
    const map = postMap([QUIAPO, CUBAO, MAKATI], [null, null]);

    expect(postMapFramingPoints(map)).toEqual([
      { lat: 14.5995, lng: 120.9842 },
      { lat: 14.6197, lng: 121.0527 },
      { lat: 14.5547, lng: 121.0244 },
    ]);
  });

  it("centres and zooms on the whole path, not just the pins", () => {
    const map = postMap([QUIAPO, CUBAO], [encodePath(BULGE)]);
    const fit = fitPostMapToView(map, WIDTH, HEIGHT);

    expect(fit.latitude).toBeCloseTo((14.5 + 14.6197) / 2, 9);
    expect(fit.longitude).toBeCloseTo((120.9842 + 121.2) / 2, 9);
    expect(fits(BULGE, fit.zoom)).toBe(true);
    expect(fits(BULGE, fit.zoom + 1)).toBe(false);
    expect(fit.zoom).toBeLessThan(fitPinsToView([QUIAPO, CUBAO], WIDTH, HEIGHT).zoom);
  });

  it("frames a map with no stored paths exactly as its pins", () => {
    const map = postMap([QUIAPO, CUBAO, MAKATI], [null, null]);

    expect(fitPostMapToView(map, WIDTH, HEIGHT)).toEqual(
      fitPinsToView([QUIAPO, CUBAO, MAKATI], WIDTH, HEIGHT)
    );
  });

  it("treats a stored path that doesn't decode like a null pair", () => {
    const map = postMap([QUIAPO, CUBAO], ["~"]);

    expect(postMapFramingPoints(map)).toHaveLength(2);
    expect(pairLinePoints(map, 0)).toEqual([
      { lat: 14.5995, lng: 120.9842 },
      { lat: 14.6197, lng: 121.0527 },
    ]);
  });

  it("fits any list of points, for guides to reuse", () => {
    expect(fitPointsToView(BULGE, WIDTH, HEIGHT)).toEqual(
      fitPostMapToView(postMap([QUIAPO, CUBAO], [encodePath(BULGE)]), WIDTH, HEIGHT)
    );
  });
});

describe("post map line", () => {
  it("draws a pair's stored street path as written", () => {
    const map = postMap([QUIAPO, CUBAO], [encodePath(BULGE)]);
    const line = pairLinePoints(map, 0);

    expect(line).toHaveLength(4);
    line.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(BULGE[i]!.lat, 9);
      expect(p.lng).toBeCloseTo(BULGE[i]!.lng, 9);
    });
  });

  it("draws a null pair as the straight line between its pins", () => {
    const map = postMap([QUIAPO, CUBAO], [null]);

    expect(pairLinePoints(map, 0)).toEqual([
      { lat: 14.5995, lng: 120.9842 },
      { lat: 14.6197, lng: 121.0527 },
    ]);
  });

  it("chains a street path and a straight pair without repeating the shared pin", () => {
    const map = postMap([QUIAPO, CUBAO, MAKATI], [encodePath(BULGE), null]);
    const line = postMapLinePoints(map);

    expect(line).toHaveLength(5);
    expect(line[3]!.lat).toBeCloseTo(14.6197, 9);
    expect(line[3]!.lng).toBeCloseTo(121.0527, 9);
    expect(line[4]).toEqual({ lat: 14.5547, lng: 121.0244 });
  });

  it("is today's straight line through the pins when every pair is null", () => {
    const map = postMap([QUIAPO, CUBAO, MAKATI], [null, null]);

    expect(postMapLinePoints(map)).toEqual([
      { lat: 14.5995, lng: 120.9842 },
      { lat: 14.6197, lng: 121.0527 },
      { lat: 14.5547, lng: 121.0244 },
    ]);
  });

  it("writes GeoJSON coordinates as [lng, lat]", () => {
    expect(lineStringFromPoints([{ lat: 14.5995, lng: 120.9842 }]).geometry.coordinates).toEqual([
      [120.9842, 14.5995],
    ]);
  });
});

describe("guideMapFit", () => {
  const leg = (id: string, origin: MapPin, destination: MapPin): GuideLeg => ({
    id,
    mode: "jeepney",
    origin,
    destination,
    vias: [],
    expressways: false,
    path: null,
  });

  it("fits every leg's origin and destination", () => {
    const legs = [leg("a", QUIAPO, CUBAO), leg("b", CUBAO, MAKATI)];
    const fit = guideMapFit(legs, WIDTH, HEIGHT);
    const pins = guideAllPins(legs);

    expect(pins).toHaveLength(4);
    expect(fit).toEqual(fitPinsToView(pins, WIDTH, HEIGHT));
    expect(fits(pins, fit.zoom)).toBe(true);
    expect(fits(pins, fit.zoom + 1)).toBe(false);
  });

  it("centres a leg whose ends are the same point at a street-level zoom", () => {
    const fit = guideMapFit([leg("a", QUIAPO, { ...QUIAPO })], WIDTH, HEIGHT);

    expect(fit).toEqual({ longitude: QUIAPO.lng, latitude: QUIAPO.lat, zoom: 14 });
  });
});

describe("guide street paths", () => {
  const leg = (
    id: string,
    origin: MapPin,
    destination: MapPin,
    path: string | null,
    mode: GuideLeg["mode"] = "jeepney"
  ): GuideLeg => ({ id, mode, origin, destination, vias: [], expressways: false, path });

  it("frames a leg path that bulges past the pins", () => {
    const legs = [leg("a", QUIAPO, CUBAO, encodePath(BULGE))];
    const bounds = pointBounds(guideFramingPoints(legs));

    expect(bounds).not.toBeNull();
    expect(bounds!.minLat).toBeCloseTo(14.5, 9);
    expect(bounds!.maxLat).toBeCloseTo(14.6197, 9);
    expect(bounds!.minLng).toBeCloseTo(120.9842, 9);
    expect(bounds!.maxLng).toBeCloseTo(121.2, 9);
  });

  it("centres and zooms on the pins plus the paths", () => {
    const fit = guideMapFit([leg("a", QUIAPO, CUBAO, encodePath(BULGE))], WIDTH, HEIGHT);

    expect(fit.latitude).toBeCloseTo((14.5 + 14.6197) / 2, 9);
    expect(fit.longitude).toBeCloseTo((120.9842 + 121.2) / 2, 9);
    expect(fits(BULGE, fit.zoom)).toBe(true);
    expect(fits(BULGE, fit.zoom + 1)).toBe(false);
    expect(fit.zoom).toBeLessThan(fitPinsToView([QUIAPO, CUBAO], WIDTH, HEIGHT).zoom);
  });

  it("lets null legs contribute only their pins", () => {
    const legs = [leg("a", QUIAPO, CUBAO, null), leg("b", CUBAO, MAKATI, null)];

    expect(guideFramingPoints(legs)).toEqual([
      { lat: 14.5995, lng: 120.9842 },
      { lat: 14.6197, lng: 121.0527 },
      { lat: 14.6197, lng: 121.0527 },
      { lat: 14.5547, lng: 121.0244 },
    ]);
  });

  it("treats a stored path that doesn't decode like a null leg", () => {
    const bad = leg("a", QUIAPO, CUBAO, "~");

    expect(guideFramingPoints([bad])).toHaveLength(2);
    expect(legLinePoints(bad)).toEqual([
      { lat: 14.5995, lng: 120.9842 },
      { lat: 14.6197, lng: 121.0527 },
    ]);
  });

  it("draws a leg's stored path as written", () => {
    const line = legLinePoints(leg("a", QUIAPO, CUBAO, encodePath(BULGE)));

    expect(line).toHaveLength(4);
    line.forEach((p, i) => {
      expect(p.lat).toBeCloseTo(BULGE[i]!.lat, 9);
      expect(p.lng).toBeCloseTo(BULGE[i]!.lng, 9);
    });
  });

  it("draws a null leg as the straight line between its ends, in its mode colour", () => {
    const segments = legSegments([leg("a", QUIAPO, CUBAO, null, "walking")]);

    expect(segments).toEqual([
      {
        coords: [
          [120.9842, 14.5995],
          [121.0527, 14.6197],
        ],
        color: "#6b7280",
      },
    ]);
  });

  it("draws each leg's own path in its own mode colour", () => {
    const segments = legSegments([
      leg("a", QUIAPO, CUBAO, encodePath(BULGE), "uv_express"),
      leg("b", CUBAO, MAKATI, null, "jeepney"),
    ]);

    expect(segments).toHaveLength(2);
    expect(segments[0]!.coords).toHaveLength(4);
    expect(segments[0]!.coords[1]![0]).toBeCloseTo(BULGE[1]!.lng, 9);
    expect(segments[0]!.coords[1]![1]).toBeCloseTo(BULGE[1]!.lat, 9);
    expect(segments[0]!.color).toBe("#06b6d4");
    expect(segments[1]!.coords).toHaveLength(2);
    expect(segments[1]!.color).toBe("#f59e0b");
  });

  it("keeps transfers straight between the leg ends, whatever the legs' paths", () => {
    const legs = [
      leg("a", QUIAPO, CUBAO, encodePath(BULGE)),
      leg("b", MAKATI, QUIAPO, encodePath(BULGE)),
    ];
    const transfers: GuideTransfer[] = [
      {
        id: "t",
        mode: "walking",
        from: { legId: "a", end: "destination" },
        to: { legId: "b", end: "origin" },
      },
    ];

    expect(transferSegments(legs, transfers)).toEqual([
      {
        coords: [
          [121.0527, 14.6197],
          [121.0244, 14.5547],
        ],
        color: "#6b7280",
      },
    ]);
  });
});

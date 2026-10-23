import { describe, expect, it } from "vitest";
import { fitPinsToView, worldX, worldY } from "@/components/map/post-map-geometry";
import { guideAllPins, guideMapFit } from "@/components/map/guide-geometry";
import type { GuideLeg } from "@/lib/schemas/guide-map";
import type { MapPin } from "@/lib/schemas/post-map";

const WIDTH = 600;
const HEIGHT = 240;
const PAD_PX = 32;

const QUIAPO: MapPin = { lat: 14.5995, lng: 120.9842, label: "Quiapo" };
const CUBAO: MapPin = { lat: 14.6197, lng: 121.0527, label: "Cubao" };
const MAKATI: MapPin = { lat: 14.5547, lng: 121.0244, label: "Ayala" };

/** Do all pins fit inside the padded viewport at this zoom? */
function fits(pins: MapPin[], zoom: number): boolean {
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

describe("guideMapFit", () => {
  const leg = (id: string, origin: MapPin, destination: MapPin): GuideLeg => ({
    id,
    mode: "jeepney",
    origin,
    destination,
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

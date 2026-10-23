import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/geocode/reverse/route";

describe("reverse geocode", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["no coordinates", ""],
    ["no latitude", "?lon=121.0527"],
    ["no longitude", "?lat=14.6197"],
    ["a blank latitude", "?lat=&lon=121.0527"],
    ["a blank longitude", "?lat=14.6197&lon=%20"],
    ["a point in Tokyo", "?lat=35.6762&lon=139.6503"],
    ["a point off the coast of Africa", "?lat=0&lon=0"],
  ])("rejects %s with 400 without asking Nominatim", async (_case, query) => {
    const upstream = vi.spyOn(globalThis, "fetch");

    const res = await GET(new NextRequest(`http://localhost/api/geocode/reverse${query}`));

    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe("reverse geocode through Nominatim", () => {
  // One fake clock for these tests: the shared client's 1 s spacing state
  // carries across tests, so time must only move forward.
  beforeAll(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }));
  afterAll(() => vi.useRealTimers());
  afterEach(() => vi.restoreAllMocks());

  async function get(query: string) {
    const pending = GET(new NextRequest(`http://localhost/api/geocode/reverse${query}`));
    await vi.advanceTimersByTimeAsync(2000);
    return pending;
  }

  it("answers a labeled place, detail line included, with a public Cache-Control header", async () => {
    const upstream = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      Response.json({
        lat: "14.6197",
        lon: "121.0527",
        name: "Araneta City Bus Port",
        display_name:
          "Araneta City Bus Port, General Romulo Avenue, Socorro, Cubao, Quezon City, Metro Manila, 1109, Philippines",
        category: "amenity",
        type: "bus_station",
        address: {
          amenity: "Araneta City Bus Port",
          road: "General Romulo Avenue",
          quarter: "Socorro",
          suburb: "Cubao",
          city: "Quezon City",
          state: "Metro Manila",
          postcode: "1109",
          country: "Philippines",
          country_code: "ph",
        },
      }),
    );

    const res = await get("?lat=14.61972&lon=121.05268");

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400",
    );
    expect(await res.json()).toEqual({
      displayName: "Araneta City Bus Port",
      detailName: "General Romulo Avenue, Socorro, Cubao, Quezon City, Metro Manila",
      secondaryName: "Socorro, Quezon City, Metro Manila",
      fullName:
        "Araneta City Bus Port, General Romulo Avenue, Socorro, Cubao, Quezon City, Metro Manila, 1109, Philippines",
      lat: 14.6197,
      lon: 121.0527,
    });
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("answers repeated taps on the sea from cache", async () => {
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json({ error: "Unable to geocode" }));

    // Manila Bay, then a tap about a metre away (same 4-decimal key).
    const first = await get("?lat=14.5378&lon=120.9705");
    const second = await get("?lat=14.53781&lon=120.97049");

    for (const res of [first, second]) {
      expect(res.status).toBe(404);
      expect(res.headers.get("Cache-Control")).toMatch(/^public, /);
      expect(await res.json()).toEqual({ error: "No address found at this point" });
    }
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});

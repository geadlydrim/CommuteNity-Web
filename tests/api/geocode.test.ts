import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/geocode/route";

const FOUND_CACHE_CONTROL = "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400";

function request(params: Record<string, string>) {
  return new NextRequest(`http://localhost/api/geocode?${new URLSearchParams(params).toString()}`);
}

/** The route shares one Nominatim client whose 1 s spacing runs on (here, fake) timers. */
async function get(params: Record<string, string>) {
  const pending = GET(request(params));
  await vi.advanceTimersByTimeAsync(2000);
  return pending;
}

const ARANETA_BUS_PORT = {
  place_id: 123456,
  lat: "14.6197",
  lon: "121.0527",
  name: "Araneta City Bus Port",
  display_name:
    "Araneta City Bus Port, General Romulo Avenue, Socorro, Cubao, Quezon City, Metro Manila, 1109, Philippines",
  category: "amenity",
  type: "bus_station",
  importance: 0.21,
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
};

describe("forward geocode", () => {
  // One fake clock for the whole file: the shared client's spacing state carries
  // across tests, so time must only move forward.
  beforeAll(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }));
  afterAll(() => vi.useRealTimers());
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["zero", "0"],
    ["above 10", "11"],
    ["a fraction", "2.5"],
    ["not a number", "five"],
    ["blank", ""],
  ])("rejects a limit that is %s with 400 without asking Nominatim", async (_case, limit) => {
    const upstream = vi.spyOn(globalThis, "fetch");

    const res = await GET(request({ q: "Cubao", limit }));

    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: "Limit must be a whole number from 1 to 10" });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("rejects a too-short query with 400 without asking Nominatim", async () => {
    const upstream = vi.spyOn(globalThis, "fetch");

    const res = await GET(request({ q: "C" }));

    expect(res.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("answers places with a public Cache-Control header", async () => {
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json([ARANETA_BUS_PORT]));

    const res = await get({ q: "Araneta Bus Port", limit: "3" });

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe(FOUND_CACHE_CONTROL);
    expect(await res.json()).toEqual([
      {
        displayName: "Araneta City Bus Port",
        detailName: "General Romulo Avenue, Socorro, Cubao, Quezon City, Metro Manila",
        secondaryName: "Socorro, Quezon City, Metro Manila",
        fullName:
          "Araneta City Bus Port, General Romulo Avenue, Socorro, Cubao, Quezon City, Metro Manila, 1109, Philippines",
        lat: 14.6197,
        lon: 121.0527,
        type: "bus_station",
        category: "amenity",
        importance: 0.21,
      },
    ]);

    expect(upstream).toHaveBeenCalledTimes(1);
    const url = new URL(String(upstream.mock.calls[0]?.[0]));
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("q")).toBe("Araneta Bus Port");
    expect(url.searchParams.get("limit")).toBe("3");
    expect(url.searchParams.get("countrycodes")).toBe("ph");
  });

  it("answers 503 busy at once when four requests are already waiting", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    // Nominatim never answers; each attempt ends only when the client aborts it.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );

    // One request holds the upstream slot; four wait behind it.
    const held = ["Cubao", "Quiapo", "Monumento", "Baclaran", "Pasay Rotonda"].map((q) =>
      GET(request({ q })),
    );

    const res = await GET(request({ q: "Lawton" }));

    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ error: expect.stringMatching(/busy/i) });

    // The others time out within the 8 s budget instead of hanging.
    await vi.advanceTimersByTimeAsync(10_000);
    const statuses = await Promise.all(held.map(async (pending) => (await pending).status));
    expect(statuses).toEqual([504, 504, 504, 504, 504]);
  });
});

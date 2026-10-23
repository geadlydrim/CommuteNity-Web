import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    expect(upstream).not.toHaveBeenCalled();
  });
});

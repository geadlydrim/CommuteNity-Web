import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/tiles/[z]/[x]/[y]/route";
import { geocoderUserAgent } from "@/lib/env";

// Central Manila (14.5995, 120.9842) at zoom 14.
const MANILA = { z: "14", x: "13698", y: "7520" };

function get(tile: { z: string; x: string; y: string }) {
  return GET(new NextRequest(`http://localhost/api/tiles/${tile.z}/${tile.x}/${tile.y}`), {
    params: Promise.resolve(tile),
  });
}

describe("tile proxy", () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["zoom 20", { z: "20", x: "876370", y: "481300" }],
    ["a tile over Paris at zoom 12", { z: "12", x: "2074", y: "1409" }],
    ["a tile index past the edge of the world", { z: "3", x: "8", y: "3" }],
    ["a non-numeric coordinate", { z: "14", x: "13698", y: "7520.png" }],
    ["a negative coordinate", { z: "14", x: "-1", y: "7520" }],
  ])("rejects %s with 400 without asking OpenStreetMap", async (_case, tile) => {
    const upstream = vi.spyOn(globalThis, "fetch");

    const res = await get(tile);

    expect(res.status).toBe(400);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(upstream).not.toHaveBeenCalled();
  });

  it("serves a Manila tile as a PNG with week-long public caching", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(png, { headers: { "Content-Type": "image/png" } }));

    const res = await get(MANILA);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400",
    );
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(png);

    expect(upstream).toHaveBeenCalledTimes(1);
    const call = upstream.mock.calls[0];
    expect(call?.[0]).toBe("https://tile.openstreetmap.org/14/13698/7520.png");
    expect(new Headers(call?.[1]?.headers).get("User-Agent")).toBe(geocoderUserAgent());
  });

  it("serves the whole-world tile at zoom 0", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1])));

    const res = await get({ z: "0", x: "0", y: "0" });

    expect(res.status).toBe(200);
  });

  it.each([
    ["answers 500", () => Promise.resolve(new Response("oops", { status: 500 }))],
    ["is unreachable", () => Promise.reject(new TypeError("fetch failed"))],
  ])("returns 502 without caching when OpenStreetMap %s", async (_case, answer) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockImplementation(answer);

    const res = await get(MANILA);

    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

import { NextResponse, type NextRequest } from "next/server";
import { geocoderUserAgent } from "@/lib/env";
import { isPhilippineTile } from "@/lib/map/tiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Seconds. The upstream fetch gives up after 8 s (UPSTREAM_TIMEOUT_MS); this leaves room to answer. */
export const maxDuration = 10;

const UPSTREAM_TIMEOUT_MS = 8_000;

/** OSM's tile policy asks for at least 7 days of caching; the CDN serves stale for a day while refetching. */
const TILE_CACHE_CONTROL =
  "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400";

/** Plain non-negative integers only (no sign, extension, or exponent); 2^19 has 6 digits. */
const TILE_INDEX = /^\d{1,7}$/;

function errorResponse(status: 400 | 502, error: string) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Caching proxy for OpenStreetMap raster tiles (ADR 0003). Serves only zoom
 * 0–19 tiles over the Philippines, so it can't be used as an open proxy.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const raw = await params;
  if (!TILE_INDEX.test(raw.z) || !TILE_INDEX.test(raw.x) || !TILE_INDEX.test(raw.y)) {
    return errorResponse(400, "Tile coordinates must be whole numbers");
  }
  const z = Number(raw.z);
  const x = Number(raw.x);
  const y = Number(raw.y);
  if (!isPhilippineTile(z, x, y)) {
    return errorResponse(400, "Only tiles over the Philippines at zoom 0–19 are served");
  }

  try {
    const upstream = await fetch(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`, {
      headers: { "User-Agent": geocoderUserAgent() },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      console.error(`[Tiles] upstream answered ${upstream.status} for ${z}/${x}/${y}`);
      return errorResponse(502, "The map tile server didn't answer");
    }
    const image = await upstream.arrayBuffer();
    return new NextResponse(image, {
      headers: { "Content-Type": "image/png", "Cache-Control": TILE_CACHE_CONTROL },
    });
  } catch (err) {
    console.error(`[Tiles] upstream failed for ${z}/${x}/${y}`, err);
    return errorResponse(502, "The map tile server didn't answer");
  }
}

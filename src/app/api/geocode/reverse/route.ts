import { NextResponse, type NextRequest } from "next/server";
import { latSchema, lonSchema } from "@/lib/schemas/geocode";
import { fetchNominatim, cacheGet, cacheSet } from "@/lib/geo/nominatim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // --- Validate query params ---
  const latResult = latSchema.safeParse(searchParams.get("lat") ?? "");
  const lonResult = lonSchema.safeParse(searchParams.get("lon") ?? "");

  if (!latResult.success || !lonResult.success) {
    return NextResponse.json(
      { error: "lat and lon are required and must be valid coordinates" },
      { status: 400 }
    );
  }
  const lat = latResult.data;
  const lon = lonResult.data;

  // --- Cache lookup ---
  const cacheKey = `reverse:${lat.toFixed(5)}:${lon.toFixed(5)}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  // --- Proxy to Nominatim reverse (shared throttle in nominatim.ts) ---
  try {
    const raw = (await fetchNominatim("reverse", {
      format: "jsonv2",
      lat: String(lat),
      lon: String(lon),
    })) as Record<string, unknown>;

    // Nominatim reverse returns a single object (not an array).
    // If the point is in the ocean or off-map, it returns an error key.
    if (raw.error) {
      return NextResponse.json(
        { error: String(raw.error) },
        { status: 404 }
      );
    }

    const result = {
      displayName: raw.display_name as string,
      lat: Number(raw.lat),
      lon: Number(raw.lon),
    };

    cacheSet(cacheKey, result);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      console.error("[ReverseGeocode] upstream timed out");
      return NextResponse.json({ error: "Reverse geocoding request timed out" }, { status: 504 });
    }
    console.error("[ReverseGeocode] unexpected error", err);
    return NextResponse.json({ error: "Reverse geocoding failed" }, { status: 502 });
  }
}

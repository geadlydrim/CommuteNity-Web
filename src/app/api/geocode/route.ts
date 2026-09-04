import { NextResponse, type NextRequest } from "next/server";
import { geocodeQuerySchema, limitSchema } from "@/lib/schemas/geocode";
import { fetchNominatim, cacheGet, cacheSet, buildLabelParts } from "@/lib/geo/nominatim";
import type { GeocodeResult } from "@/lib/geo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // --- Validate query params ---
  const qRaw = searchParams.get("q") ?? "";
  const qResult = geocodeQuerySchema.safeParse(qRaw);
  if (!qResult.success) {
    return NextResponse.json(
      { error: qResult.error.issues[0]?.message ?? "Invalid query" },
      { status: 400 }
    );
  }
  const q = qResult.data;

  const limitResult = limitSchema.safeParse(searchParams.get("limit") ?? undefined);
  const limit = limitResult.success ? limitResult.data : 5;

  // --- Cache lookup ---
  const cacheKey = `search:${q.toLowerCase()}:${limit}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  // --- Proxy to Nominatim (shared throttle in nominatim.ts) ---
  try {
    const raw = (await fetchNominatim("search", {
      format: "jsonv2",
      q,
      limit: String(limit),
      countrycodes: "ph",
      addressdetails: "1",
    })) as Record<string, unknown>[];

    const results: GeocodeResult[] = raw.map((item) => {
      const p = buildLabelParts(item as Record<string, unknown>);
      return {
        displayName: p.primary,
        detailName: p.detail || undefined,
        secondaryName: p.secondary || undefined,
        fullName: p.full || undefined,
        lat: Number(item.lat),
        lon: Number(item.lon),
        type: item.type as string,
        category: item.class as string | undefined,
        importance: item.importance as number | undefined,
      };
    });

    cacheSet(cacheKey, results);
    return NextResponse.json(results);
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      console.error("[Geocode] upstream timed out");
      return NextResponse.json({ error: "Geocoding request timed out" }, { status: 504 });
    }
    console.error("[Geocode] unexpected error", err);
    return NextResponse.json({ error: "Geocoding failed" }, { status: 502 });
  }
}

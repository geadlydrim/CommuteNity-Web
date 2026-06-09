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

    // Re-rank: Nominatim orders by OSM node importance, not query-name similarity.
    // A result whose POI name contains the query words is more relevant than one
    // where the words only appear in its address (e.g. it sits in a barangay
    // named after something in the query). Score = fraction of query words found
    // in displayName; ties broken by Nominatim importance.
    const queryWords = q.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
    if (queryWords.length > 0) {
      results.sort((a, b) => {
        const scoreOf = (r: GeocodeResult) => {
          const name = r.displayName.toLowerCase();
          const hits = queryWords.filter((w) => name.includes(w)).length;
          return hits / queryWords.length;
        };
        const diff = scoreOf(b) - scoreOf(a);
        if (diff !== 0) return diff;
        return (b.importance ?? 0) - (a.importance ?? 0);
      });
    }

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

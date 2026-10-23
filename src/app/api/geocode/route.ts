import { NextResponse, type NextRequest } from "next/server";
import { geocodeQuerySchema, limitSchema } from "@/lib/schemas/geocode";
import { GEOCODE_CACHE_CONTROL, geocodeFailure, nominatim } from "@/lib/geo/nominatim";
import { buildLabelParts } from "@/lib/geo/label";
import type { GeocodeResult } from "@/lib/geo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Seconds. The Nominatim client gives up after 8 s (BUDGET_MS); this leaves room to answer. */
export const maxDuration = 10;

function invalid(message: string) {
  return NextResponse.json(
    { error: message },
    { status: 400, headers: { "Cache-Control": GEOCODE_CACHE_CONTROL.error } },
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // --- Validate query params ---
  const qResult = geocodeQuerySchema.safeParse(searchParams.get("q") ?? "");
  if (!qResult.success) {
    return invalid(qResult.error.issues[0]?.message ?? "Invalid query");
  }
  const limitResult = limitSchema.safeParse(searchParams.get("limit") ?? undefined);
  if (!limitResult.success) {
    return invalid(limitResult.error.issues[0]?.message ?? "Invalid limit");
  }

  // --- Nominatim, through the shared queue and cache ---
  try {
    const places = await nominatim.search({ q: qResult.data, limit: limitResult.data });

    const results: GeocodeResult[] = places.map((place) => {
      const p = buildLabelParts(place);
      return {
        displayName: p.primary,
        detailName: p.detail || undefined,
        secondaryName: p.secondary || undefined,
        fullName: p.full || undefined,
        lat: place.lat,
        lon: place.lon,
        type: place.type,
        category: place.category,
        importance: place.importance,
      };
    });

    return NextResponse.json(results, {
      headers: { "Cache-Control": GEOCODE_CACHE_CONTROL.found },
    });
  } catch (err) {
    const failure = geocodeFailure(err);
    if (failure.status !== 503) console.error("[Geocode] upstream failed", err);
    return NextResponse.json(
      { error: failure.error },
      { status: failure.status, headers: { "Cache-Control": GEOCODE_CACHE_CONTROL.error } },
    );
  }
}

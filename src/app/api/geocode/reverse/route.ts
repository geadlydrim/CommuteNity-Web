import { NextResponse, type NextRequest } from "next/server";
import { latSchema, lonSchema } from "@/lib/schemas/geocode";
import { GEOCODE_CACHE_CONTROL, geocodeFailure, nominatim } from "@/lib/geo/nominatim";
import { buildLabelParts } from "@/lib/geo/label";
import type { ReverseGeocodeResult } from "@/lib/geo/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Seconds. The Nominatim client gives up after 8 s (BUDGET_MS); this leaves room to answer. */
export const maxDuration = 10;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // --- Validate query params ---
  const latResult = latSchema.safeParse(searchParams.get("lat") ?? undefined);
  const lonResult = lonSchema.safeParse(searchParams.get("lon") ?? undefined);

  if (!latResult.success || !lonResult.success) {
    return NextResponse.json(
      { error: "lat and lon are required and must be inside the Philippines" },
      { status: 400, headers: { "Cache-Control": GEOCODE_CACHE_CONTROL.error } },
    );
  }

  // --- Nominatim, through the shared queue and cache (key rounds to 4 decimals) ---
  try {
    const place = await nominatim.reverse({ lat: latResult.data, lon: lonResult.data });

    // No place at this point (open sea, off-map). Cached by the client too.
    if (!place) {
      return NextResponse.json(
        { error: "No address found at this point" },
        { status: 404, headers: { "Cache-Control": GEOCODE_CACHE_CONTROL.notFound } },
      );
    }

    const p = buildLabelParts(place);
    const result: ReverseGeocodeResult = {
      displayName: p.primary,
      detailName: p.detail || undefined,
      secondaryName: p.secondary || undefined,
      fullName: p.full || undefined,
      lat: place.lat,
      lon: place.lon,
    };

    return NextResponse.json(result, {
      headers: { "Cache-Control": GEOCODE_CACHE_CONTROL.found },
    });
  } catch (err) {
    const failure = geocodeFailure(err);
    if (failure.status !== 503) console.error("[ReverseGeocode] upstream failed", err);
    return NextResponse.json(
      { error: failure.error },
      { status: failure.status, headers: { "Cache-Control": GEOCODE_CACHE_CONTROL.error } },
    );
  }
}

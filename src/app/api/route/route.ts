import { NextResponse, type NextRequest } from "next/server";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { routerConfig } from "@/lib/env";
import { chainDistanceMeters, encodePath, joinEnds, simplifyPath } from "@/lib/map/path";
import { takeRouteRequest } from "@/lib/routing/rate-limit";
import { RouterTimeoutError, requestRoute } from "@/lib/routing/valhalla";
import {
  MAX_ROUTE_SPAN_KM,
  routeRequestSchema,
  type RouteErrorCode,
  type RouteResponse,
} from "@/lib/schemas/route";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Seconds. The router client gives up after 5 s (ROUTER_TIMEOUT_MS); this leaves room to answer. */
export const maxDuration = 10;

/** Paths are simplified at 2 m before they leave the endpoint (ADR 0004). */
const SIMPLIFY_TOLERANCE_M = 2;

/** Routes depend on the rider's request, so no browser or CDN may keep them. */
const NO_STORE = { "Cache-Control": "no-store" };

function fail(
  status: number,
  code: RouteErrorCode,
  error: string,
  headers: Record<string, string> = {},
) {
  return NextResponse.json({ error, code }, { status, headers: { ...NO_STORE, ...headers } });
}

const FAILED = "Street paths aren't working right now. Try again later.";

export async function POST(request: NextRequest) {
  // --- Signed-in riders only; middleware skips this route, so check here ---
  let riderId: string | undefined;
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error && isAuthRetryableFetchError(error)) throw error;
    riderId = user?.id;
  } catch (err) {
    console.error("[Route] couldn't confirm sign-in", err);
    return fail(502, "failed", FAILED);
  }
  if (!riderId) return fail(401, "unauthorized", "Sign in to get street paths.");

  // --- 60 requests a minute per rider ---
  const retryAfter = takeRouteRequest(riderId);
  if (retryAfter !== null) {
    return fail(429, "busy", "Street paths are busy right now. Try again in a moment.", {
      "Retry-After": String(retryAfter),
    });
  }

  // --- Validate the request: shape, 2–12 points, Philippine bounds, span ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid", "Request body must be JSON");
  }
  const parsed = routeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return fail(400, "invalid", parsed.error.issues[0]?.message ?? "Invalid route request");
  }
  const { points, profile } = parsed.data;
  // Walking has no expressways; for cars, omitted means allowed (the post-map default).
  const expressways = profile === "car" && (parsed.data.expressways ?? true);

  const limitKm = MAX_ROUTE_SPAN_KM[profile];
  if (chainDistanceMeters(points) > limitKm * 1000) {
    return fail(
      400,
      "too_far",
      profile === "car"
        ? `That's too far to route by road. Keep it within ${limitKm} km.`
        : `That's too far to route on foot. Keep it within ${limitKm} km.`,
    );
  }

  // --- The router ---
  try {
    const config = routerConfig();
    if (!config) {
      return fail(503, "unavailable", "Street paths aren't available right now.");
    }

    const route = await requestRoute(config, { points, profile, expressways }, request.signal);

    const first = points[0]!;
    const last = points[points.length - 1]!;
    const path = encodePath(
      joinEnds(simplifyPath(route.shape, SIMPLIFY_TOLERANCE_M), first, last),
    );
    const response: RouteResponse = {
      path,
      distanceKm: route.distanceKm,
      // Tenths of a minute, in whole seconds' arithmetic.
      durationMin: Math.round(route.durationSeconds / 6) / 10,
    };
    return NextResponse.json(response, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof RouterTimeoutError) {
      return fail(504, "timeout", "Street paths took too long. Try again.");
    }
    console.error("[Route] router failed", err);
    return fail(502, "failed", FAILED);
  }
}

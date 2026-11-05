/**
 * Browser client for `POST /api/route` (ADR 0007). Builders call it for a
 * street path between pins; the reply is parsed with the endpoint's own Zod
 * schemas, so the route and its callers can't drift apart.
 *
 * Never throws: every outcome is a value. A cancelled request resolves to
 * `aborted` so a superseded call can be dropped without a try/catch.
 */
import { decodePath } from "@/lib/map/path";
import {
  routeErrorSchema,
  routeResponseSchema,
  type RouteErrorCode,
  type RouteRequest,
  type RouteResponse,
} from "@/lib/schemas/route";

export const ROUTE_ENDPOINT = "/api/route";

/** A street path has at least a start and an end. */
const MIN_PATH_POINTS = 2;

export type RouteOutcome =
  | { status: "ok"; route: RouteResponse }
  /** No router is configured: builders stop asking and keep straight lines. */
  | { status: "unavailable" }
  /** The router couldn't produce a path; `code` says why (`network`: no answer; `unexpected`: unusable body). */
  | { status: "failed"; code: RouteErrorCode | "network" | "unexpected"; message: string }
  /** The caller's signal cancelled the request. */
  | { status: "aborted" };

function failed(code: RouteErrorCode | "network" | "unexpected", message: string): RouteOutcome {
  return { status: "failed", code, message };
}

/** Asks the routing endpoint for one street path. */
export async function fetchRoute(request: RouteRequest, signal?: AbortSignal): Promise<RouteOutcome> {
  try {
    const res = await fetch(ROUTE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
    const body: unknown = await res.json().catch(() => null);

    if (signal?.aborted) return { status: "aborted" };
    if (!res.ok) {
      const error = routeErrorSchema.safeParse(body);
      if (!error.success) return failed("unexpected", `Routing failed (${res.status})`);
      if (error.data.code === "unavailable") return { status: "unavailable" };
      return failed(error.data.code, error.data.error);
    }

    const route = routeResponseSchema.safeParse(body);
    if (!route.success) return failed("unexpected", "Routing returned an unexpected response");
    try {
      if (decodePath(route.data.path).length < MIN_PATH_POINTS) {
        return failed("unexpected", "Routing returned an empty path");
      }
    } catch {
      return failed("unexpected", "Routing returned a malformed path");
    }
    return { status: "ok", route: route.data };
  } catch {
    // fetch rejects on a cancelled request and on a network failure.
    return signal?.aborted ? { status: "aborted" } : failed("network", "Couldn't reach the routing service");
  }
}

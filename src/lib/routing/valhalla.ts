/**
 * Server-only client for the self-hosted Valhalla router (ADR 0007). The
 * browser never calls it: only `/api/route` does.
 */
import { z } from "zod";
import type { RouterConfig } from "@/lib/env";
import { decodePath6, type LatLng } from "@/lib/map/path";
import type { RouteProfile } from "@/lib/schemas/route";

/** Header carrying `ROUTER_SECRET` to the router's front proxy. */
export const ROUTER_SECRET_HEADER = "X-Router-Secret";

/** How long the router may take before the request is cancelled. */
export const ROUTER_TIMEOUT_MS = 5000;

/** The router didn't answer within {@link ROUTER_TIMEOUT_MS}. */
export class RouterTimeoutError extends Error {
  constructor() {
    super(`Router took longer than ${ROUTER_TIMEOUT_MS}ms`);
    this.name = "RouterTimeoutError";
  }
}

/** The router was unreachable, answered with an error, or sent something unreadable. */
export class RouterError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "RouterError";
    this.status = status;
  }
}

export type RouterQuery = {
  /** Origin, vias, destination. */
  points: readonly LatLng[];
  profile: RouteProfile;
  /** Car only: false avoids tolls and expressways. */
  expressways: boolean;
};

/** The router's answer, with the shape decoded to points. */
export type RouterResult = {
  shape: LatLng[];
  distanceKm: number;
  durationSeconds: number;
};

/** Valhalla `/route` request body: vias are `through` so the leg isn't split. */
export function valhallaRequestBody({ points, profile, expressways }: RouterQuery) {
  const last = points.length - 1;
  const locations = points.map((p, i) => ({
    lat: p.lat,
    lon: p.lng,
    type: i === 0 || i === last ? "break" : "through",
  }));

  if (profile === "walk") {
    return { locations, costing: "pedestrian", directions_type: "none" };
  }
  const allow = expressways ? 1 : 0;
  return {
    locations,
    costing: "auto",
    costing_options: { auto: { use_tolls: allow, use_highways: allow } },
    directions_type: "none",
  };
}

const valhallaResponseSchema = z.object({
  trip: z.object({
    legs: z.array(z.object({ shape: z.string() })).min(1),
    summary: z.object({
      /** Kilometres (the request's default unit). */
      length: z.number(),
      /** Seconds. */
      time: z.number(),
    }),
  }),
});

/**
 * Asks the router for a path. Throws {@link RouterTimeoutError} when it is
 * still working after {@link ROUTER_TIMEOUT_MS} (the request is aborted), and
 * {@link RouterError} for anything else that goes wrong. `signal` cancels
 * the request early, e.g. when the rider's own request is dropped.
 */
export async function requestRoute(
  config: RouterConfig,
  query: RouterQuery,
  signal?: AbortSignal,
): Promise<RouterResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new RouterTimeoutError());
  }, ROUTER_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) abortFromCaller();
  else signal?.addEventListener("abort", abortFromCaller, { once: true });

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (config.secret) headers[ROUTER_SECRET_HEADER] = config.secret;

  try {
    const res = await fetch(`${config.url}/route`, {
      method: "POST",
      headers,
      body: JSON.stringify(valhallaRequestBody(query)),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new RouterError(`Router returned HTTP ${res.status}`, res.status);

    const parsed = valhallaResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new RouterError("Router returned an unexpected response");
    const { legs, summary } = parsed.data.trip;

    // `through` points keep a route to one leg; join several defensively.
    const shape: LatLng[] = [];
    for (const leg of legs) {
      const points = decodePath6(leg.shape);
      const prev = shape[shape.length - 1];
      const first = points[0];
      const repeatsPrev = prev && first && prev.lat === first.lat && prev.lng === first.lng;
      shape.push(...points.slice(repeatsPrev ? 1 : 0));
    }
    if (shape.length < 2) throw new RouterError("Router returned an empty path");
    return { shape, distanceKm: summary.length, durationSeconds: summary.time };
  } catch (err) {
    if (timedOut) throw new RouterTimeoutError();
    if (err instanceof RouterError) throw err;
    throw new RouterError("Could not reach the router", undefined, { cause: err });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

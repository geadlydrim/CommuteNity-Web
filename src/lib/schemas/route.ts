import { z } from "zod";
import { PH_LAT_RANGE, PH_LNG_RANGE } from "./post-map";

// ---------------------------------------------------------------------------
// /api/route (ADR 0007): the routing endpoint takes one leg or pin pair and
// answers with a street path. The route validates with these schemas and the
// browser client parses its reply with them.
// ---------------------------------------------------------------------------

/** Origin, vias, and destination: 2 pins and up to 10 vias. */
export const MIN_ROUTE_POINTS = 2;
export const MAX_ROUTE_POINTS = 12;

/** Longest total straight-line span, in km, the endpoint will route. */
export const MAX_ROUTE_SPAN_KM = { car: 500, walk: 25 } as const;

export const routeProfileSchema = z.enum(["car", "walk"], {
  error: "Profile must be car or walk",
});

export type RouteProfile = z.infer<typeof routeProfileSchema>;

const OUTSIDE_PH = "Every point must be inside the Philippines";

const routePointSchema = z.object(
  {
    lat: z
      .number({ error: OUTSIDE_PH })
      .min(PH_LAT_RANGE.min, OUTSIDE_PH)
      .max(PH_LAT_RANGE.max, OUTSIDE_PH),
    lng: z
      .number({ error: OUTSIDE_PH })
      .min(PH_LNG_RANGE.min, OUTSIDE_PH)
      .max(PH_LNG_RANGE.max, OUTSIDE_PH),
  },
  { error: "Each point needs a latitude and longitude" },
);

const POINT_COUNT = `Routing needs ${MIN_ROUTE_POINTS} to ${MAX_ROUTE_POINTS} points`;

/** `/api/route` request body. */
export const routeRequestSchema = z.object(
  {
    points: z
      .array(routePointSchema, { error: POINT_COUNT })
      .min(MIN_ROUTE_POINTS, POINT_COUNT)
      .max(MAX_ROUTE_POINTS, POINT_COUNT),
    profile: routeProfileSchema,
    /** Car only: false avoids tolls and expressways. Omitted means allowed; walking ignores it. */
    expressways: z.boolean({ error: "Expressways must be true or false" }).optional(),
  },
  { error: "Request body must be a route request" },
);

export type RouteRequest = z.infer<typeof routeRequestSchema>;

/** `/api/route` 200 body, and nothing else. */
export const routeResponseSchema = z.object({
  /** Precision-5 encoded polyline, simplified at 2 m, joined to the first and last points. */
  path: z.string(),
  distanceKm: z.number(),
  durationMin: z.number(),
});

export type RouteResponse = z.infer<typeof routeResponseSchema>;

/**
 * What an error says, besides its status:
 * - `unauthorized` 401, `invalid` and `too_far` 400, `busy` 429
 * - `unavailable` 503: no router is configured (builders draw straight lines)
 * - `timeout` 504, `failed` 502
 */
export const routeErrorCodeSchema = z.enum([
  "unauthorized",
  "invalid",
  "too_far",
  "busy",
  "unavailable",
  "timeout",
  "failed",
]);

export type RouteErrorCode = z.infer<typeof routeErrorCodeSchema>;

/** Error body of `/api/route`: rider-friendly `error`, machine-readable `code`. */
export const routeErrorSchema = z.object({
  error: z.string(),
  code: routeErrorCodeSchema,
});

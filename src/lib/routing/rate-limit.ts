/**
 * Per-rider request limit for the routing endpoint (ADR 0007): at most
 * {@link ROUTE_LIMIT} requests in any {@link ROUTE_WINDOW_MS}. The counter is
 * in memory, so it holds per server instance only: the same caveat as the
 * geocoder's queue.
 */

export const ROUTE_LIMIT = 60;
export const ROUTE_WINDOW_MS = 60_000;

/** Request times (ms) inside the window, oldest first, per rider. */
const requests = new Map<string, number[]>();
let lastSweep = 0;

/**
 * Counts a request for `riderId`. Returns `null` when it is allowed, or the
 * seconds until the oldest counted request leaves the window when it is not
 * (a refused request isn't counted).
 */
export function takeRouteRequest(riderId: string, now = Date.now()): number | null {
  // Once a window, forget riders who have gone quiet so the map can't grow without bound.
  if (now - lastSweep >= ROUTE_WINDOW_MS) {
    lastSweep = now;
    for (const [id, times] of requests) {
      if (now - times[times.length - 1]! >= ROUTE_WINDOW_MS) requests.delete(id);
    }
  }

  const times = (requests.get(riderId) ?? []).filter((t) => now - t < ROUTE_WINDOW_MS);
  if (times.length >= ROUTE_LIMIT) {
    requests.set(riderId, times);
    return Math.max(1, Math.ceil((times[0]! + ROUTE_WINDOW_MS - now) / 1000));
  }
  times.push(now);
  requests.set(riderId, times);
  return null;
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRoute, ROUTE_CLIENT_TIMEOUT_MS } from "@/lib/routing/client";
import type { RouteRequest } from "@/lib/schemas/route";

const REQUEST: RouteRequest = {
  points: [
    { lat: 14.5995, lng: 120.9842 },
    { lat: 15.145, lng: 120.5887 },
  ],
  profile: "car",
  expressways: true,
};

/** The Google polyline documentation example: three points. */
const PATH = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function stubFetch(reply: () => Response | Promise<Response>) {
  const spy = vi.fn<typeof fetch>(() => Promise.resolve().then(reply));
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchRoute", () => {
  it("posts the request as JSON to /api/route and returns the route", async () => {
    const spy = stubFetch(() => json({ path: PATH, distanceKm: 12.5, durationMin: 30 }));

    const outcome = await fetchRoute(REQUEST);

    expect(outcome).toEqual({ status: "ok", route: { path: PATH, distanceKm: 12.5, durationMin: 30 } });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("/api/route");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(REQUEST);
  });

  it("reports unavailable when the endpoint says no router is configured", async () => {
    stubFetch(() => json({ error: "Routing is not available", code: "unavailable" }, 503));

    expect(await fetchRoute(REQUEST)).toEqual({ status: "unavailable" });
  });

  it.each([
    ["busy", 429],
    ["timeout", 504],
    ["failed", 502],
    ["too_far", 400],
    ["unauthorized", 401],
  ] as const)("reports a %s answer as a failure carrying the rider message", async (code, status) => {
    stubFetch(() => json({ error: `message for ${code}`, code }, status));

    expect(await fetchRoute(REQUEST)).toEqual({ status: "failed", code, message: `message for ${code}` });
  });

  it("reports an error body it doesn't recognise as an unexpected failure", async () => {
    stubFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));

    expect(await fetchRoute(REQUEST)).toMatchObject({ status: "failed", code: "unexpected" });
  });

  it("reports a 200 body that isn't a route as an unexpected failure", async () => {
    stubFetch(() => json({ distanceKm: 1 }));

    expect(await fetchRoute(REQUEST)).toMatchObject({ status: "failed", code: "unexpected" });
  });

  it("reports a 200 with an empty or malformed path as an unexpected failure", async () => {
    stubFetch(() => json({ path: "", distanceKm: 1, durationMin: 1 }));
    expect(await fetchRoute(REQUEST)).toMatchObject({ status: "failed", code: "unexpected" });

    stubFetch(() => json({ path: "_p~iF ~ps|U", distanceKm: 1, durationMin: 1 }));
    expect(await fetchRoute(REQUEST)).toMatchObject({ status: "failed", code: "unexpected" });
  });

  it("reports an unreachable endpoint as a network failure", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));

    expect(await fetchRoute(REQUEST)).toMatchObject({ status: "failed", code: "network" });
  });

  it("reports a cancelled request as aborted, not as a failure", async () => {
    const controller = new AbortController();
    const spy = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError"))
          );
        })
    );
    vi.stubGlobal("fetch", spy);

    const pending = fetchRoute(REQUEST, controller.signal);
    controller.abort();

    expect(await pending).toEqual({ status: "aborted" });
  });

  /** A fetch that never answers, and rejects like the real one once its signal aborts. */
  function stubHungFetch() {
    const spy = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError"))
          );
        })
    );
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  it("gives up on a hung connection after the client deadline, as a timeout failure", async () => {
    vi.useFakeTimers();
    stubHungFetch();

    const pending = fetchRoute(REQUEST);
    await vi.advanceTimersByTimeAsync(ROUTE_CLIENT_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toMatchObject({ status: "failed", code: "timeout" });
  });

  it("gives up when the reply's body never finishes arriving", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              new Promise((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () =>
                  reject(new DOMException("The operation was aborted.", "AbortError"))
                );
              }),
          } as unknown as Response)
      )
    );

    const pending = fetchRoute(REQUEST);
    await vi.advanceTimersByTimeAsync(ROUTE_CLIENT_TIMEOUT_MS);

    expect(await pending).toMatchObject({ status: "failed", code: "timeout" });
  });

  it("reports the caller's cancel as aborted even when it comes before the deadline", async () => {
    vi.useFakeTimers();
    stubHungFetch();
    const controller = new AbortController();

    const pending = fetchRoute(REQUEST, controller.signal);
    await vi.advanceTimersByTimeAsync(ROUTE_CLIENT_TIMEOUT_MS - 1);
    controller.abort();
    await vi.advanceTimersByTimeAsync(ROUTE_CLIENT_TIMEOUT_MS);

    expect(await pending).toEqual({ status: "aborted" });
  });

  it("makes no request for a signal that is already aborted", async () => {
    const spy = stubFetch(() => json({ path: PATH, distanceKm: 1, durationMin: 1 }));
    const controller = new AbortController();
    controller.abort();

    expect(await fetchRoute(REQUEST, controller.signal)).toEqual({ status: "aborted" });
    expect(spy).not.toHaveBeenCalled();
  });
});

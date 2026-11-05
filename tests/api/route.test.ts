import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/route/route";

const { getUser } = vi.hoisted(() => ({
  getUser: vi.fn<() => Promise<unknown>>(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

const ROUTER = "http://router.test:8002";

// Cubao to Quiapo, the smoke-test pair.
const CUBAO = { lat: 14.62, lng: 121.0529 };
const QUIAPO = { lat: 14.6019, lng: 120.9838 };

// What Valhalla returns for Cubao → Quiapo: a precision-6 shape that starts and
// ends a few metres off the pins (snapped to the road), with a point 1 m off a
// straight stretch (dropped at 2 m) and a real corner (kept). Expected values
// below come from an independent polyline encoder, not from the code under test.
const SNAPPED_SHAPE_6 = "g{i{Zosn{eFfyNnm_AQ~oRP~oR?~f^bsRfE";
// The same road at precision 5, simplified at 2 m and joined to CUBAO and QUIAPO.
const JOINED_PATH_5 = "_nfxAsczaVSSrq@fmE?~_Fx}@RHR";

// A shape whose ends are exactly the pins: nothing to join.
const MATCHING_SHAPE_6 = "_ui{Zgmn{eF~oRfg_AfyNnueA";
const MATCHING_PATH_5 = "_nfxAsczaVn}@rlErq@faF";

type ValhallaOptions = { shape?: string; length?: number; time?: number };

function valhalla({ shape = SNAPPED_SHAPE_6, length = 12.345, time = 1234 }: ValhallaOptions = {}) {
  return { trip: { legs: [{ shape }], summary: { length, time } } };
}

let riderId = 0;

function signIn() {
  riderId += 1;
  getUser.mockResolvedValue({ data: { user: { id: `rider-${riderId}` } }, error: null });
}

function post(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

const carBody = (extra: Record<string, unknown> = {}) => ({
  points: [CUBAO, QUIAPO],
  profile: "car",
  expressways: true,
  ...extra,
});

function stubValhalla(options?: ValhallaOptions) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async () => Response.json(valhalla(options)));
}

/** The JSON body of the n-th call to the stubbed router. */
function sentToRouter(upstream: { mock: { calls: unknown[][] } }, call = 0) {
  const init = upstream.mock.calls[call]![1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe("routing endpoint", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.stubEnv("ROUTER_URL", ROUTER);
    vi.stubEnv("ROUTER_SECRET", undefined);
    signIn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("answer", () => {
    it("returns only path, distanceKm, and durationMin, not cacheable", async () => {
      stubValhalla({ length: 12.345, time: 1234 });

      const res = await post(carBody());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(Object.keys(body).sort()).toEqual(["distanceKm", "durationMin", "path"]);
      expect(body.distanceKm).toBe(12.345);
      expect(body.durationMin).toBe(20.6); // 1234 s
    });

    it("simplifies at 2 m and joins the path to the requested origin and destination", async () => {
      stubValhalla();

      const body = await (await post(carBody())).json();

      expect(body.path).toBe(JOINED_PATH_5);
    });

    it("adds nothing at ends that already match the requested points", async () => {
      stubValhalla({ shape: MATCHING_SHAPE_6 });

      const body = await (await post(carBody())).json();

      expect(body.path).toBe(MATCHING_PATH_5);
    });

    it("accepts the smallest and the largest request: 2 and 12 points", async () => {
      const upstream = stubValhalla();
      const twelve = Array.from({ length: 12 }, (_, i) => ({ lat: 14.6 + i * 0.001, lng: 121 }));

      expect((await post(carBody())).status).toBe(200);
      expect((await post(carBody({ points: twelve }))).status).toBe(200);
      expect(sentToRouter(upstream, 1).locations).toHaveLength(12);
    });
  });

  describe("what it asks the router", () => {
    it("posts one request to the router's /route", async () => {
      const upstream = stubValhalla();

      await post(carBody());

      expect(upstream).toHaveBeenCalledTimes(1);
      const [url, init] = upstream.mock.calls[0]!;
      expect(url).toBe(`${ROUTER}/route`);
      expect((init as RequestInit).method).toBe("POST");
    });

    it("uses auto costing and allows tolls and highways when expressways is true", async () => {
      const upstream = stubValhalla();

      await post(carBody({ expressways: true }));

      const sent = sentToRouter(upstream);
      expect(sent.costing).toBe("auto");
      expect(sent.costing_options.auto.use_tolls).toBe(1);
      expect(sent.costing_options.auto.use_highways).toBe(1);
    });

    it("avoids tolls and highways when expressways is false", async () => {
      const upstream = stubValhalla();

      await post(carBody({ expressways: false }));

      const sent = sentToRouter(upstream);
      expect(sent.costing).toBe("auto");
      expect(sent.costing_options.auto.use_tolls).toBe(0);
      expect(sent.costing_options.auto.use_highways).toBe(0);
    });

    it("allows expressways for a car request that doesn't say", async () => {
      const upstream = stubValhalla();

      await post({ points: [CUBAO, QUIAPO], profile: "car" });

      const sent = sentToRouter(upstream);
      expect(sent.costing_options.auto.use_tolls).toBe(1);
      expect(sent.costing_options.auto.use_highways).toBe(1);
    });

    it("uses pedestrian costing for walking, whatever expressways says", async () => {
      const upstream = stubValhalla();
      const near = [CUBAO, { lat: 14.625, lng: 121.055 }];

      await post({ points: near, profile: "walk", expressways: false });

      const sent = sentToRouter(upstream);
      expect(sent.costing).toBe("pedestrian");
      expect(sent.costing_options).toBeUndefined();
    });

    it("sends the origin and destination as stops and the vias as through points", async () => {
      const upstream = stubValhalla();
      const via1 = { lat: 14.61, lng: 121.03 };
      const via2 = { lat: 14.605, lng: 121.0 };

      await post(carBody({ points: [CUBAO, via1, via2, QUIAPO] }));

      expect(upstream).toHaveBeenCalledTimes(1);
      expect(sentToRouter(upstream).locations).toEqual([
        { lat: 14.62, lon: 121.0529, type: "break" },
        { lat: 14.61, lon: 121.03, type: "through" },
        { lat: 14.605, lon: 121.0, type: "through" },
        { lat: 14.6019, lon: 120.9838, type: "break" },
      ]);
    });

    it("sends no secret header when ROUTER_SECRET is unset", async () => {
      const upstream = stubValhalla();

      await post(carBody());

      const headers = new Headers((upstream.mock.calls[0]![1] as RequestInit).headers);
      expect(headers.get("X-Router-Secret")).toBeNull();
    });

    it("sends ROUTER_SECRET as the X-Router-Secret header when set", async () => {
      vi.stubEnv("ROUTER_SECRET", "s3cret");
      const upstream = stubValhalla();

      await post(carBody());

      const headers = new Headers((upstream.mock.calls[0]![1] as RequestInit).headers);
      expect(headers.get("X-Router-Secret")).toBe("s3cret");
    });
  });

  describe("who may ask", () => {
    it("answers 401 to a signed-out request without asking the router", async () => {
      getUser.mockResolvedValue({ data: { user: null }, error: null });
      const upstream = stubValhalla();

      const res = await post(carBody());

      expect(res.status).toBe(401);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.json()).toMatchObject({ code: "unauthorized" });
      expect(upstream).not.toHaveBeenCalled();
    });

    it("answers 502, not 401, when the session check can't reach Supabase", async () => {
      getUser.mockRejectedValue(new TypeError("fetch failed"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      const upstream = stubValhalla();

      const res = await post(carBody());

      expect(res.status).toBe(502);
      expect(upstream).not.toHaveBeenCalled();
    });

    it("answers 429 to the 61st request in a minute, per rider", async () => {
      const upstream = stubValhalla();

      for (let i = 0; i < 60; i++) {
        expect((await post(carBody())).status).toBe(200);
      }
      const res = await post(carBody());

      expect(res.status).toBe(429);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.json()).toMatchObject({ code: "busy" });
      expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
      expect(upstream).toHaveBeenCalledTimes(60);

      // Another rider is unaffected.
      signIn();
      expect((await post(carBody())).status).toBe(200);
    });

    it("lets a rider route again once the minute has passed", async () => {
      stubValhalla();
      for (let i = 0; i < 60; i++) await post(carBody());
      expect((await post(carBody())).status).toBe(429);

      await vi.advanceTimersByTimeAsync(60_001);

      expect((await post(carBody())).status).toBe(200);
    });
  });

  describe("what it refuses without asking the router", () => {
    const outside = [
      ["south of the Philippines", { lat: 3.9, lng: 121 }],
      ["north of the Philippines", { lat: 21.1, lng: 121 }],
      ["west of the Philippines (Hong Kong)", { lat: 14.6, lng: 114.17 }],
      ["east of the Philippines", { lat: 14.6, lng: 127.1 }],
    ] as const;

    it.each(outside)("a point %s is a 400", async (_where, point) => {
      const upstream = stubValhalla();

      const res = await post(carBody({ points: [CUBAO, point] }));

      expect(res.status).toBe(400);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.json()).toMatchObject({ code: "invalid" });
      expect(upstream).not.toHaveBeenCalled();
    });

    const thirteen = Array.from({ length: 13 }, (_, i) => ({ lat: 14.6 + i * 0.001, lng: 121 }));

    it.each([
      ["no points", carBody({ points: [] })],
      ["one point", carBody({ points: [CUBAO] })],
      ["13 points", carBody({ points: thirteen })],
      ["points that aren't a list", carBody({ points: "14.6,121" })],
      ["a point without a longitude", carBody({ points: [CUBAO, { lat: 14.6 }] })],
      ["a point with text coordinates", carBody({ points: [CUBAO, { lat: "14.6", lng: "121" }] })],
      ["no profile", { points: [CUBAO, QUIAPO] }],
      ["an unknown profile", carBody({ profile: "bike" })],
      ["a non-boolean expressways", carBody({ expressways: "no" })],
      ["a body that isn't JSON", "not json"],
      ["a JSON body that isn't an object", "[]"],
    ])("%s is a 400", async (_case, body) => {
      const upstream = stubValhalla();

      const res = await post(body);

      expect(res.status).toBe(400);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.json()).toMatchObject({ code: "invalid" });
      expect(upstream).not.toHaveBeenCalled();
    });

    // One degree of latitude is 111.2 km, so 4.5° is 500.4 km and 0.23° is 25.6 km.
    it("refuses a car request whose straight-line span is over 500 km", async () => {
      const upstream = stubValhalla();

      const res = await post(
        carBody({ points: [{ lat: 10, lng: 123 }, { lat: 14.5, lng: 123 }] }),
      );

      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ code: "too_far" });
      expect(upstream).not.toHaveBeenCalled();
    });

    it("accepts a car request just under 500 km", async () => {
      stubValhalla();

      const res = await post(
        carBody({ points: [{ lat: 10, lng: 123 }, { lat: 14.4, lng: 123 }] }),
      );

      expect(res.status).toBe(200);
    });

    it("counts the detour through vias toward the span", async () => {
      const upstream = stubValhalla();
      // 2.2° (244.6 km) out and back: the ends are 0 km apart but the chain is 489.3 km.
      const out = { lat: 10, lng: 123 };
      const away = { lat: 12.2, lng: 123 };

      const res = await post(carBody({ points: [out, away, out] }));
      expect(res.status).toBe(200);
      expect(upstream).toHaveBeenCalledTimes(1);

      // 2.3° out and back is 511.5 km.
      const farther = { lat: 12.3, lng: 123 };
      const refused = await post(carBody({ points: [out, farther, out] }));
      expect(refused.status).toBe(400);
      expect(upstream).toHaveBeenCalledTimes(1);
    });

    it("refuses a walking request whose span is over 25 km but allows the same by car", async () => {
      const upstream = stubValhalla();
      const points = [{ lat: 14.4, lng: 121 }, { lat: 14.63, lng: 121 }];

      const walk = await post({ points, profile: "walk" });
      expect(walk.status).toBe(400);
      expect(await walk.json()).toMatchObject({ code: "too_far" });
      expect(upstream).not.toHaveBeenCalled();

      expect((await post({ points, profile: "car" })).status).toBe(200);
    });

    it("accepts a walking request just under 25 km", async () => {
      stubValhalla();
      const points = [{ lat: 14.4, lng: 121 }, { lat: 14.62, lng: 121 }];

      expect((await post({ points, profile: "walk" })).status).toBe(200);
    });
  });

  describe("when the router is unavailable", () => {
    it.each([
      ["unset", undefined],
      ["blank", ""],
    ])("reports routing unavailable, without any fetch, when ROUTER_URL is %s", async (_case, value) => {
      vi.stubEnv("ROUTER_URL", value);
      const upstream = vi.spyOn(globalThis, "fetch");

      const res = await post(carBody());

      expect(res.status).toBe(503);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.json()).toMatchObject({ code: "unavailable" });
      expect(upstream).not.toHaveBeenCalled();
    });

    it("answers 504 when the router is still working after 5 s, and cancels the call", async () => {
      let signal: AbortSignal | undefined;
      const upstream = vi.spyOn(globalThis, "fetch").mockImplementation(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            signal = init?.signal ?? undefined;
            signal?.addEventListener("abort", () => reject(signal?.reason));
          }),
      );
      let settled = false;

      const pending = post(carBody()).then((res) => {
        settled = true;
        return res;
      });
      await vi.waitFor(() => expect(upstream).toHaveBeenCalled());

      await vi.advanceTimersByTimeAsync(4000);
      expect(settled).toBe(false);
      expect(signal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(1100);
      const res = await pending;

      expect(res.status).toBe(504);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.json()).toMatchObject({ code: "timeout" });
      expect(signal?.aborted).toBe(true);
    });

    it("answers 504 when the router sends headers but stalls on the body", async () => {
      let signal: AbortSignal | undefined;
      const upstream = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
        signal = init?.signal ?? undefined;
        const stalled = new ReadableStream({
          start(controller) {
            signal?.addEventListener("abort", () => controller.error(signal?.reason));
          },
        });
        return new Response(stalled, { headers: { "Content-Type": "application/json" } });
      });

      const pending = post(carBody());
      await vi.waitFor(() => expect(upstream).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(5100);
      const res = await pending;

      expect(res.status).toBe(504);
      expect(signal?.aborted).toBe(true);
    });

    describe("answers 502 when the router fails", () => {
      beforeEach(() => {
        vi.spyOn(console, "error").mockImplementation(() => {});
      });

      it.each([
        ["answers HTTP 500", () => new Response("boom", { status: 500 })],
        [
          "answers HTTP 400 (no path found)",
          () => Response.json({ error_code: 442, error: "No path could be found" }, { status: 400 }),
        ],
        ["answers HTTP 404", () => new Response("not found", { status: 404 })],
        ["answers 200 with a body that isn't JSON", () => new Response("<html>proxy error</html>")],
        ["answers 200 with JSON that isn't a route", () => Response.json({ hello: "world" })],
        ["answers 200 with a malformed shape", () => Response.json(valhalla({ shape: "_p~iF~ps|" }))],
        ["answers 200 with an empty shape", () => Response.json(valhalla({ shape: "" }))],
        ["can't be reached", () => Promise.reject(new TypeError("fetch failed"))],
      ])("when the router %s", async (_case, answer) => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async () => answer());

        const res = await post(carBody());

        expect(res.status).toBe(502);
        expect(res.headers.get("Cache-Control")).toBe("no-store");
        expect(await res.json()).toMatchObject({ code: "failed" });
      });
    });
  });
});

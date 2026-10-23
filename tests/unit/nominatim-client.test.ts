import { describe, expect, it, vi } from "vitest";
import {
  BusyError,
  createNominatimClient,
  GeocodeTimeoutError,
  UpstreamError,
} from "@/lib/geo/nominatim";

/** A clock and sleep that only move when the test calls `advance`. */
function fakeTime() {
  let now = 0;
  let seq = 0;
  const timers: { at: number; seq: number; fire: () => void }[] = [];

  function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve();
      const timer = {
        at: now + ms,
        seq: seq++,
        fire: () => {
          signal?.removeEventListener("abort", cancel);
          resolve();
        },
      };
      const cancel = () => {
        const index = timers.indexOf(timer);
        if (index >= 0) timers.splice(index, 1);
        resolve();
      };
      timers.push(timer);
      signal?.addEventListener("abort", cancel, { once: true });
    });
  }

  /** Move time forward, firing due timers in order and letting their work run. */
  async function advance(ms: number): Promise<void> {
    const end = now + ms;
    for (;;) {
      await drain();
      const due = timers
        .filter((t) => t.at <= end)
        .sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      now = due.at;
      due.fire();
    }
    now = end;
    await drain();
  }

  return { now: () => now, sleep, advance };
}

/** Let pending promise callbacks run (setImmediate only drains the microtask queue; it is not a clock). */
function drain(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

type Reply = { status?: number; body?: unknown } | "hang";

function setup(reply: (call: number) => Reply) {
  const clock = fakeTime();
  const starts: number[] = [];
  const fetch = vi.fn((_url: string, init: RequestInit): Promise<Response> => {
    starts.push(clock.now());
    const r = reply(starts.length);
    if (r === "hang") {
      // Never answers; rejects only when the client aborts the attempt.
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      });
    }
    return Promise.resolve(
      new Response(JSON.stringify(r.body ?? []), { status: r.status ?? 200 }),
    );
  });
  const client = createNominatimClient({
    fetch,
    now: clock.now,
    sleep: clock.sleep,
    userAgent: "CommuteNity tests",
  });
  return { clock, client, fetch, starts };
}

const ARANETA_BUS_PORT = {
  lat: "14.6197",
  lon: "121.0527",
  name: "Araneta City Bus Port",
  display_name: "Araneta City Bus Port, General Romulo Avenue, Socorro, Cubao, Quezon City, Metro Manila, 1109, Philippines",
  category: "amenity",
  type: "bus_station",
  importance: 0.21,
  address: {
    amenity: "Araneta City Bus Port",
    road: "General Romulo Avenue",
    quarter: "Socorro",
    suburb: "Cubao",
    city: "Quezon City",
    state: "Metro Manila",
    postcode: "1109",
    country: "Philippines",
    country_code: "ph",
  },
};

describe("Nominatim client spacing", () => {
  it("starts two simultaneous calls at least 1000 ms apart", async () => {
    const { clock, client, starts } = setup(() => ({ body: [] }));

    const calls = [
      client.search({ q: "Cubao", limit: 5 }),
      client.search({ q: "Quiapo", limit: 5 }),
    ];
    await clock.advance(10_000);
    await Promise.all(calls);

    expect(starts).toEqual([0, 1000]);
  });

  it("starts three simultaneous calls, search and reverse alike, 1000 ms apart", async () => {
    const { clock, client, starts } = setup(() => ({ body: [] }));

    const calls = [
      client.search({ q: "Cubao", limit: 5 }),
      client.reverse({ lat: 14.5995, lon: 120.9842 }),
      client.search({ q: "Monumento", limit: 5 }),
    ];
    await clock.advance(10_000);
    await Promise.allSettled(calls);

    expect(starts).toEqual([0, 1000, 2000]);
  });
});

describe("Nominatim client queue", () => {
  it("rejects a 5th waiting caller immediately with BusyError", async () => {
    const { clock, client, fetch } = setup(() => "hang");

    // One caller holds the upstream slot; four wait behind it.
    const queued = Array.from({ length: 5 }, (_, i) =>
      client.search({ q: `stop ${i}`, limit: 5 }).catch((err: unknown) => err),
    );

    await expect(client.search({ q: "one too many", limit: 5 })).rejects.toBeInstanceOf(BusyError);
    await clock.advance(0);
    expect(fetch).toHaveBeenCalledTimes(1);

    // The holder and all four waiters run out of budget instead of being refused.
    await clock.advance(8000);
    const outcomes = await Promise.all(queued);
    expect(outcomes.every((err) => err instanceof GeocodeTimeoutError)).toBe(true);
  });
});

describe("Nominatim client time budget", () => {
  it("gives up on a hanging upstream at 8000 ms", async () => {
    const { clock, client, fetch } = setup(() => "hang");

    let outcome: unknown;
    void client.search({ q: "Cubao", limit: 5 }).then(
      () => {
        outcome = "resolved";
      },
      (err: unknown) => {
        outcome = err;
      },
    );

    await clock.advance(7999);
    expect(outcome).toBeUndefined();

    await clock.advance(1);
    expect(outcome).toBeInstanceOf(GeocodeTimeoutError);
    // Every upstream attempt was aborted, none left running.
    for (const [, init] of fetch.mock.calls) expect(init.signal?.aborted).toBe(true);
  });

  it("charges queue wait to the budget", async () => {
    const { clock, client, fetch } = setup(() => "hang");

    const first = client.search({ q: "Cubao", limit: 5 }).catch((err: unknown) => err);
    let second: unknown;
    void client.search({ q: "Quiapo", limit: 5 }).then(
      () => {
        second = "resolved";
      },
      (err: unknown) => {
        second = err;
      },
    );

    // Both arrived at 0; the second waited behind the first until its own 8 s ran out.
    await clock.advance(8000);
    expect(second).toBeInstanceOf(GeocodeTimeoutError);
    expect(await first).toBeInstanceOf(GeocodeTimeoutError);
    const asked = fetch.mock.calls.map(([url]) => new URL(url).searchParams.get("q"));
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((q) => q === "Cubao")).toBe(true);
  });
});

describe("Nominatim client retries", () => {
  it("retries a 500 and returns the next 200 answer", async () => {
    const { clock, client, fetch, starts } = setup((call) =>
      call === 1 ? { status: 500, body: { error: "Internal Server Error" } } : { body: [ARANETA_BUS_PORT] },
    );

    const call = client.search({ q: "Araneta Bus Port", limit: 5 });
    await clock.advance(8000);
    const places = await call;

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(starts[1]).toBeGreaterThanOrEqual(1000);
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({ name: "Araneta City Bus Port", lat: 14.6197, lon: 121.0527 });
  });

  it("does not retry a 400", async () => {
    const { clock, client, fetch } = setup(() => ({ status: 400, body: { error: "Bad Request" } }));

    const call = client.search({ q: "Cubao", limit: 5 }).catch((err: unknown) => err);
    await clock.advance(8000);
    const err = await call;

    expect(err).toBeInstanceOf(UpstreamError);
    expect(err).toMatchObject({ status: 400 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("Nominatim client cache", () => {
  it("evicts the least recently used of 200 entries when a 201st key arrives", async () => {
    const { clock, client, fetch } = setup(() => ({ body: [] }));
    async function search(q: string) {
      const call = client.search({ q, limit: 5 });
      await clock.advance(1000);
      return call;
    }

    for (let i = 0; i < 200; i++) await search(`stop ${i}`);
    expect(fetch).toHaveBeenCalledTimes(200);

    await search("stop 0"); // read: now the most recently used
    expect(fetch).toHaveBeenCalledTimes(200);

    await search("stop 200"); // 201st key evicts the least recently used: stop 1
    expect(fetch).toHaveBeenCalledTimes(201);

    await search("stop 0");
    expect(fetch).toHaveBeenCalledTimes(201);

    await search("stop 1");
    expect(fetch).toHaveBeenCalledTimes(202);
  });

  it("serves a repeat for 5 minutes, then asks upstream again", async () => {
    const { clock, client, fetch } = setup(() => ({ body: [ARANETA_BUS_PORT] }));

    await client.search({ q: "Araneta Bus Port", limit: 5 });
    await clock.advance(299_999);
    await client.search({ q: "araneta bus port", limit: 5 });
    expect(fetch).toHaveBeenCalledTimes(1);

    await clock.advance(1);
    await client.search({ q: "Araneta Bus Port", limit: 5 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("caches a reverse 'no result' answer, keyed to 4 decimal places", async () => {
    const { client, fetch } = setup(() => ({ body: { error: "Unable to geocode" } }));

    // Manila Bay, then a tap about a metre away.
    await expect(client.reverse({ lat: 14.5378, lon: 120.9705 })).resolves.toBeNull();
    await expect(client.reverse({ lat: 14.53781, lon: 120.97049 })).resolves.toBeNull();

    expect(fetch).toHaveBeenCalledTimes(1);
    const url = new URL(fetch.mock.calls[0]?.[0] ?? "");
    expect(url.searchParams.get("lat")).toBe("14.5378");
    expect(url.searchParams.get("lon")).toBe("120.9705");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("geocoderUserAgent", () => {
  // env.ts caches the validated value at module level, so each case resets the
  // module registry and imports it fresh after stubbing the environment.
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a valid value", async () => {
    vi.stubEnv("GEOCODER_USER_AGENT", "CommuteNity/1.0 (https://commutenity.ph)");
    const { geocoderUserAgent } = await import("@/lib/env");
    expect(geocoderUserAgent()).toBe("CommuteNity/1.0 (https://commutenity.ph)");
  });

  it("throws on a malformed value", async () => {
    vi.stubEnv("GEOCODER_USER_AGENT", "CommuteNity");
    const { geocoderUserAgent } = await import("@/lib/env");
    expect(() => geocoderUserAgent()).toThrow(/GEOCODER_USER_AGENT/);
  });

  it("falls back to the dev default when unset outside production", async () => {
    vi.stubEnv("GEOCODER_USER_AGENT", undefined);
    vi.stubEnv("NODE_ENV", "development");
    const { geocoderUserAgent } = await import("@/lib/env");
    expect(geocoderUserAgent()).toBe("CommuteNity/0.1 (dev)");
  });

  it("treats a blank value as unset (CI defines empty variables)", async () => {
    vi.stubEnv("GEOCODER_USER_AGENT", "");
    vi.stubEnv("NODE_ENV", "test");
    const { geocoderUserAgent } = await import("@/lib/env");
    expect(geocoderUserAgent()).toBe("CommuteNity/0.1 (dev)");
  });

  it("throws when unset in production", async () => {
    vi.stubEnv("GEOCODER_USER_AGENT", undefined);
    vi.stubEnv("NODE_ENV", "production");
    const { geocoderUserAgent } = await import("@/lib/env");
    expect(() => geocoderUserAgent()).toThrow(/GEOCODER_USER_AGENT/);
  });
});

describe("routerConfig", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is undefined when ROUTER_URL is unset", async () => {
    vi.stubEnv("ROUTER_URL", undefined);
    const { routerConfig } = await import("@/lib/env");
    expect(routerConfig()).toBeUndefined();
  });

  it("treats a blank ROUTER_URL as unset", async () => {
    vi.stubEnv("ROUTER_URL", "  ");
    const { routerConfig } = await import("@/lib/env");
    expect(routerConfig()).toBeUndefined();
  });

  it("returns the URL without a trailing slash and no secret by default", async () => {
    vi.stubEnv("ROUTER_URL", "http://127.0.0.1:8002/");
    vi.stubEnv("ROUTER_SECRET", undefined);
    const { routerConfig } = await import("@/lib/env");
    expect(routerConfig()).toEqual({ url: "http://127.0.0.1:8002", secret: undefined });
  });

  it("returns the secret when set and ignores a blank one", async () => {
    vi.stubEnv("ROUTER_URL", "https://router.example.com");
    vi.stubEnv("ROUTER_SECRET", "s3cret");
    const { routerConfig } = await import("@/lib/env");
    expect(routerConfig()).toEqual({ url: "https://router.example.com", secret: "s3cret" });

    vi.stubEnv("ROUTER_SECRET", "");
    expect(routerConfig()?.secret).toBeUndefined();
  });

  it.each(["not a url", "ftp://router.example.com", "127.0.0.1:8002"])(
    "throws on ROUTER_URL %s",
    async (value) => {
      vi.stubEnv("ROUTER_URL", value);
      const { routerConfig } = await import("@/lib/env");
      expect(() => routerConfig()).toThrow(/ROUTER_URL/);
    },
  );
});

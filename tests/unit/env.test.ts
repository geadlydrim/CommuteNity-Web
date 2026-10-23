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

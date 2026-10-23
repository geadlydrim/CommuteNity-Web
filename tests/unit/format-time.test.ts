import { describe, expect, it } from "vitest";
import { formatPostTime } from "@/lib/format-time";

// 04:00 on Oct 23, 2026 in Manila (UTC+8), still Oct 22 in UTC.
const now = new Date("2026-10-22T20:00:00Z");

describe("formatPostTime", () => {
  it("shows the time for a post from the same Manila day, across a UTC midnight", () => {
    // 01:00 on Oct 23 in Manila; the UTC dates of post and now also differ from Manila's.
    expect(formatPostTime("2026-10-22T17:00:00Z", now)).toMatch(/^1:00\sAM$/);
    expect(formatPostTime("2026-10-22T17:05:00Z", now)).toMatch(/^1:05\sAM$/);
  });

  it("shows the date for yesterday in Manila, even when it is the same UTC day", () => {
    // 23:00 on Oct 22 in Manila.
    expect(formatPostTime("2026-10-22T15:00:00Z", now)).toBe("Oct 22");
  });

  it("omits the year for earlier dates this year", () => {
    expect(formatPostTime("2026-01-05T03:00:00Z", now)).toBe("Jan 5");
    // Dec 31 in UTC, but already Jan 1, 2026 in Manila.
    expect(formatPostTime("2025-12-31T17:00:00Z", now)).toBe("Jan 1");
  });

  it("includes the year for a previous year", () => {
    expect(formatPostTime("2025-10-09T03:00:00Z", now)).toBe("Oct 9, 2025");
  });
});

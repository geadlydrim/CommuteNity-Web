import { describe, expect, it } from "vitest";
import { railLoadOf, settledOnNeededChange, type RailSettled } from "@/components/map/rail-load-state";

const READY: RailSettled = { status: "ready", rail: { lines: [] } };
const FAILED: RailSettled = { status: "failed" };

describe("railLoadOf", () => {
  it("is idle while no rail leg needs the file", () => {
    expect(railLoadOf(false, null)).toEqual({ status: "idle" });
  });

  it("is loading while the file is needed and nothing has settled", () => {
    expect(railLoadOf(true, null)).toEqual({ status: "loading" });
  });

  it("reports a settled load as it settled", () => {
    expect(railLoadOf(true, READY)).toBe(READY);
    expect(railLoadOf(true, FAILED)).toBe(FAILED);
  });
});

describe("a retry after a failed load", () => {
  it("forgets the failure, so the retry reads loading rather than failed", () => {
    const afterFailure = settledOnNeededChange(FAILED);

    expect(afterFailure).toBeNull();
    expect(railLoadOf(true, afterFailure)).toEqual({ status: "loading" });
  });

  it("reads idle again when the rail leg went away instead", () => {
    expect(railLoadOf(false, settledOnNeededChange(FAILED))).toEqual({ status: "idle" });
  });

  it("keeps a loaded rail", () => {
    expect(settledOnNeededChange(READY)).toBe(READY);
    expect(settledOnNeededChange(null)).toBeNull();
  });
});

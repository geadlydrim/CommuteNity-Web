/**
 * The status model behind `useRail`, kept pure (no React) so Node tests cover
 * it. A load in flight is always `loading`; `failed` only once the load has
 * settled failed, so a retry never reads as a finished failure.
 */
import type { RailData } from "@/lib/rail/slice";

export type RailLoad =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; rail: RailData }
  | { status: "failed" };

/** What a finished load left behind; `null` while none has finished (or after a failure was forgotten). */
export type RailSettled = Extract<RailLoad, { status: "ready" | "failed" }> | null;

// Stable, so a consumer memoizing on the result isn't invalidated on every render.
const IDLE: RailLoad = { status: "idle" };
const LOADING: RailLoad = { status: "loading" };

/** The status for a render: a settled load wins; otherwise `loading` if a rail leg needs the file, else `idle`. */
export function railLoadOf(needed: boolean, settled: RailSettled): RailLoad {
  if (settled) return settled;
  return needed ? LOADING : IDLE;
}

/**
 * `settled` after `needed` flipped: a failure is forgotten so the load runs
 * again (and reads `loading` meanwhile); a loaded rail is kept.
 */
export function settledOnNeededChange(settled: RailSettled): RailSettled {
  return settled?.status === "failed" ? null : settled;
}

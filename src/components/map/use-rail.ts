/**
 * useRail — loads the rail file for a builder once a rail leg needs it, never
 * before (the feed and a guide without rail legs never fetch it). The chunk is
 * a dynamic import from this app (`loadRail`); nothing asks Overpass.
 *
 * `idle` while no rail leg exists, `loading` until the chunk arrives, then
 * `ready` with the prepared rail or `failed` (rail legs stay straight). A later
 * `needed` after a failure tries again.
 */
import { useEffect, useState } from "react";
import { loadRail } from "@/lib/rail/load";
import type { RailData } from "@/lib/rail/slice";

export type RailLoad =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; rail: RailData }
  | { status: "failed" };

// Stable, so a consumer memoizing on the result isn't invalidated on every render.
const IDLE: RailLoad = { status: "idle" };
const LOADING: RailLoad = { status: "loading" };

/** @param needed whether the guide has a rail leg; the load starts when this first holds. */
export function useRail(needed: boolean): RailLoad {
  const [loaded, setLoaded] = useState<{ status: "ready"; rail: RailData } | { status: "failed" } | null>(null);

  useEffect(() => {
    if (!needed) return;
    let cancelled = false;
    loadRail().then(
      (rail) => {
        if (!cancelled) setLoaded({ status: "ready", rail });
      },
      () => {
        if (!cancelled) setLoaded({ status: "failed" });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [needed]);

  if (loaded) return loaded;
  return needed ? LOADING : IDLE;
}

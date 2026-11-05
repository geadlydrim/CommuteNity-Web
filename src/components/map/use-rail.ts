/**
 * useRail — loads the rail file for a builder once a rail leg needs it, never
 * before (the feed and a guide without rail legs never fetch it). The chunk is
 * a dynamic import from this app (`loadRail`); nothing asks Overpass.
 *
 * `idle` while no rail leg exists, `loading` while the chunk is loading (first
 * load or a retry), then `ready` with the prepared rail or `failed` (rail legs
 * stay straight) once a load settles failed. A later `needed` after a failure
 * tries again, reading `loading` until it settles.
 */
import { useEffect, useState } from "react";
import { loadRail } from "@/lib/rail/load";
import { railLoadOf, settledOnNeededChange, type RailLoad, type RailSettled } from "./rail-load-state";

/** @param needed whether the guide has a rail leg; the load starts when this first holds. */
export function useRail(needed: boolean): RailLoad {
  const [settled, setSettled] = useState<RailSettled>(null);
  const [wasNeeded, setWasNeeded] = useState(needed);

  // Adjusted during render (not in the effect) so a retry never renders a stale `failed`.
  if (wasNeeded !== needed) {
    setWasNeeded(needed);
    setSettled(settledOnNeededChange(settled));
  }

  useEffect(() => {
    if (!needed) return;
    let cancelled = false;
    loadRail().then(
      (rail) => {
        if (!cancelled) setSettled({ status: "ready", rail });
      },
      () => {
        if (!cancelled) setSettled({ status: "failed" });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [needed]);

  return railLoadOf(needed, settled);
}

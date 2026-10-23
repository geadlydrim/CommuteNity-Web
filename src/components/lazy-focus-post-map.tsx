"use client";

import dynamic from "next/dynamic";

/**
 * The focus view's interactive map, fetched on demand so MapLibre stays out
 * of the feed bundle. `next/dynamic` with `ssr: false` must live in a client
 * module, hence this wrapper for the server-rendered focus view.
 */
export const LazyFocusPostMap = dynamic(
  () => import("@/components/map").then((m) => m.FocusPostMap),
  {
    ssr: false,
    // Same footprint as the map, so the card doesn't jump when it arrives.
    loading: () => <div className="mt-3 h-[220px] w-full rounded-lg bg-muted sm:h-[320px]" />,
  }
);

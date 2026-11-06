"use client";
/**
 * PROTOTYPE — throwaway. Overlay colour variants (`?overlay=1|2|3`) on the
 * decided base map (variant D), for the wayfinder ticket "Overlay colours on
 * the new base map". Shows the post's own post map, a sample guide with one
 * leg per mode (`sample-guide.json`), and the guide in the thumbnail style.
 * Branch `prototype/basemap-style`; never merge.
 */
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { MapView, Marker, Source, Layer } from "../primitives";
import { lineStringFromPoints, pointBounds, postMapFramingPoints, postMapLinePoints } from "../post-map-geometry";
import { decodePath, type LatLng } from "@/lib/map/path";
import type { MapData } from "@/lib/schemas/post-map";
import type { TransportMode } from "@/lib/schemas/modes";
import { MODE_META } from "@/lib/schemas/modes";
import { basemapStyle, type Theme } from "./styles";
import sample from "./sample-guide.json";

type Overlay = "1" | "2" | "3";
const OVERLAYS: Record<Overlay, string> = {
  "1": "Current colours, 3 px, no casing",
  "2": "Current colours, 4 px, casing",
  "3": "Retuned per theme, 4 px, casing",
};
const KEYS = Object.keys(OVERLAYS) as Overlay[];

/** Tailwind 600 shades on light, 400 on dark: retuned for the grey base map. */
const RETUNED: Record<Theme, Record<TransportMode | "post", string>> = {
  light: {
    walking: "#4b5563", bus: "#2563eb", jeepney: "#d97706", mrt: "#7c3aed", lrt: "#059669",
    uv_express: "#0891b2", p2p: "#ea580c", tricycle: "#db2777", post: "#4f46e5",
  },
  dark: {
    walking: "#9ca3af", bus: "#60a5fa", jeepney: "#fbbf24", mrt: "#a78bfa", lrt: "#34d399",
    uv_express: "#22d3ee", p2p: "#fb923c", tricycle: "#f472b6", post: "#818cf8",
  },
};

type Paint = { color: (mode: TransportMode | "post") => string; width: number; casing: string | null; casingWidth: number };

function paintFor(overlay: Overlay, theme: Theme): Paint {
  const current = (m: TransportMode | "post") => (m === "post" ? "#4338ca" : MODE_META[m].color);
  const casing = theme === "dark" ? "#0b0b0c" : "#ffffff";
  if (overlay === "1") return { color: current, width: 3, casing: null, casingWidth: 0 };
  if (overlay === "2") return { color: current, width: 4, casing, casingWidth: 7 };
  return { color: (m) => RETUNED[theme][m], width: 4, casing, casingWidth: 7 };
}

type SampleLeg = { mode: TransportMode; origin: LatLng; destination: LatLng; path: string };
const LEGS = sample as SampleLeg[];

function lineFeature(points: LatLng[], props: Record<string, unknown>) {
  return { type: "Feature" as const, properties: props, geometry: { type: "LineString" as const, coordinates: points.map((p) => [p.lng, p.lat]) } };
}

function boundsOf(points: LatLng[]) {
  const b = pointBounds(points)!;
  return [[b.minLng, b.minLat], [b.maxLng, b.maxLat]] as [[number, number], [number, number]];
}

function Lines({ id, data, paint, dashed }: { id: string; data: GeoJSON.FeatureCollection; paint: Paint; dashed?: boolean }) {
  return (
    <Source id={id} type="geojson" data={data}>
      {paint.casing && (
        <Layer id={`${id}-casing`} type="line" layout={{ "line-join": "round", "line-cap": "round" }}
          paint={{ "line-color": paint.casing, "line-width": paint.casingWidth, "line-opacity": dashed ? 0.6 : 0.9 }} />
      )}
      <Layer id={`${id}-line`} type="line" layout={{ "line-join": "round", "line-cap": "round" }}
        paint={{
          "line-color": ["get", "color"],
          "line-width": paint.width,
          "line-opacity": ["get", "opacity"],
          ...(dashed ? { "line-dasharray": [2, 2] } : {}),
        }} />
    </Source>
  );
}

export function OverlayPrototype({ map }: { map: MapData }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { resolvedTheme, setTheme } = useTheme();
  const theme: Theme = resolvedTheme === "dark" ? "dark" : "light";
  const o = params.get("overlay");
  const overlay: Overlay = (KEYS as string[]).includes(o ?? "") ? (o as Overlay) : "1";
  const [states, setStates] = useState(false);
  const paint = paintFor(overlay, theme);

  const go = (step: number) => {
    const next = new URLSearchParams(params.toString());
    next.set("overlay", KEYS[(KEYS.indexOf(overlay) + step + KEYS.length) % KEYS.length]!);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const live = useMemo(() => basemapStyle("D", theme), [theme]);
  const thumb = useMemo(() => basemapStyle("D", theme, true), [theme]);

  // Post map: its stored line (or straight line) in the post-map colour.
  const postLine = map.pins.length >= 2 ? lineStringFromPoints(postMapLinePoints(map)) : null;
  const postData = postLine && { type: "FeatureCollection" as const, features: [{ ...postLine, properties: { color: paint.color("post"), opacity: 0.9 } }] };
  const postBounds = boundsOf(postMapFramingPoints(map));

  // Guide: solid legs; with "states" on, the UV leg is routing and the P2P leg failed.
  const solid: GeoJSON.Feature[] = [];
  const routing: GeoJSON.Feature[] = [];
  const failed: GeoJSON.Feature[] = [];
  const transfers: GeoJSON.Feature[] = [];
  LEGS.forEach((l, i) => {
    const color = paint.color(l.mode);
    if (states && l.mode === "uv_express") routing.push(lineFeature(decodePath(l.path), { color, opacity: 0.35 }));
    else if (states && l.mode === "p2p") failed.push(lineFeature([l.origin, l.destination], { color, opacity: 0.9 }));
    else solid.push(lineFeature(decodePath(l.path), { color, opacity: 0.9 }));
    const next = LEGS[i + 1];
    if (next) transfers.push(lineFeature([l.destination, next.origin], { color: paint.color("walking"), opacity: 0.75 }));
  });
  const fc = (features: GeoJSON.Feature[]) => ({ type: "FeatureCollection" as const, features });
  const guidePoints = LEGS.flatMap((l) => decodePath(l.path));
  const guideBounds = boundsOf(guidePoints);
  const pins = LEGS.flatMap((l) => [l.origin, l.destination]);

  const guideLayers = (prefix: string) => (
    <>
      <Lines id={`${prefix}-transfers`} data={fc(transfers)} paint={{ ...paint, width: 2, casing: null }} dashed />
      <Lines id={`${prefix}-solid`} data={fc(solid)} paint={paint} />
      <Lines id={`${prefix}-routing`} data={fc(routing)} paint={{ ...paint, casing: null }} dashed />
      <Lines id={`${prefix}-failed`} data={fc(failed)} paint={paint} dashed />
    </>
  );

  return (
    <div className="mt-3 w-full space-y-3">
      <Label>Post map · live</Label>
      <MapView key={`post-${theme}`} className="h-[260px] overflow-hidden rounded-lg" interactive cooperativeGestures mapStyle={live}
        initialViewState={{ bounds: postBounds, fitBoundsOptions: { padding: 48, maxZoom: 15 } }}>
        {postData && <Lines id="post" data={postData} paint={paint} />}
        {map.pins.map((p, i) => (
          <Marker key={i} longitude={p.lng} latitude={p.lat} color={i === 0 ? "#22c55e" : i === map.pins.length - 1 ? "#ef4444" : "#6b7280"} />
        ))}
      </MapView>

      <Label>Sample guide · live (one leg per mode)</Label>
      <MapView key={`guide-${theme}`} className="h-[420px] overflow-hidden rounded-lg" interactive cooperativeGestures mapStyle={live}
        initialViewState={{ bounds: guideBounds, fitBoundsOptions: { padding: 32 } }}>
        {guideLayers("g")}
        {pins.map((p, i) => (
          <Marker key={i} longitude={p.lng} latitude={p.lat} anchor="center">
            <span className="block h-2.5 w-2.5 rounded-full border-2 border-white" style={{ background: i % 2 ? "#ef4444" : "#22c55e" }} />
          </Marker>
        ))}
      </MapView>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {LEGS.map((l) => (
          <span key={l.mode} className="flex items-center gap-1">
            <span className="inline-block h-1 w-4 rounded" style={{ background: paint.color(l.mode) }} />
            {MODE_META[l.mode].label}
          </span>
        ))}
      </div>

      <Label>Sample guide · thumbnail style</Label>
      <div className="aspect-[600/320] w-full overflow-hidden rounded-lg">
        <MapView key={`thumb-${theme}`} className="h-full" interactive={false} showNavigationControl={false} mapStyle={thumb}
          initialViewState={{ bounds: guideBounds, fitBoundsOptions: { padding: 16 } }}>
          {guideLayers("t")}
        </MapView>
      </div>

      {process.env.NODE_ENV !== "production" && (
        <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black px-3 py-2 text-sm text-white shadow-xl ring-2 ring-fuchsia-500">
          <button type="button" onClick={() => go(-1)} className="px-2">←</button>
          <span className="min-w-[260px] text-center">{overlay} ({OVERLAYS[overlay]})</span>
          <button type="button" onClick={() => go(1)} className="px-2">→</button>
          <button type="button" onClick={() => setStates(!states)} className="ml-1 rounded-full bg-white/15 px-2 py-0.5">
            {states ? "states on" : "states off"}
          </button>
          <button type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="rounded-full bg-white/15 px-2 py-0.5">
            {theme}
          </button>
        </div>
      )}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-fuchsia-500">{children}</p>;
}

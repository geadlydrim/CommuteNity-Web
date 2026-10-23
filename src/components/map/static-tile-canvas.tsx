/**
 * StaticTileCanvas — the one static tile renderer behind every map thumbnail.
 *
 * NO WebGL, NO map library — just Web Mercator math and `<img>` raster tiles
 * from our tile proxy (`tileUrl`), so the feed can render one per post (ADR 0005).
 * Owns the tile grid, responsive scaling (`@container`), and the OSM attribution
 * the tile usage policy requires. Callers draw their pins and lines through
 * `project`, in the canvas's fixed width × height pixel space.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { tileUrl } from "@/lib/map/tiles";
import { worldX, worldY, type FitResult } from "./post-map-geometry";

const TILE_SIZE = 256;

export interface CanvasPoint {
  x: number;
  y: number;
}

/** Latitude / longitude → pixel position inside the canvas. */
export type ProjectFn = (lat: number, lng: number) => CanvasPoint;

export interface StaticTileCanvasProps {
  /** Center and integer zoom, e.g. from `fitPinsToView`. */
  fit: FitResult;
  /** Design size in pixels; the canvas scales to its container's width at this aspect ratio. */
  width: number;
  height: number;
  ariaLabel: string;
  className?: string;
  children: (project: ProjectFn) => ReactNode;
}

export function StaticTileCanvas({
  fit,
  width,
  height,
  ariaLabel,
  className,
  children,
}: StaticTileCanvasProps) {
  const { longitude: cLng, latitude: cLat, zoom: Z } = fit;

  // World-pixel origin of the canvas's top-left corner
  const originX = worldX(cLng, Z) - width / 2;
  const originY = worldY(cLat, Z) - height / 2;

  // --- Tile range ---
  const maxTile = Math.pow(2, Z) - 1;
  const tileXMin = Math.floor(originX / TILE_SIZE);
  const tileXMax = Math.floor((originX + width - 1) / TILE_SIZE);
  const tileYMin = Math.floor(originY / TILE_SIZE);
  const tileYMax = Math.floor((originY + height - 1) / TILE_SIZE);

  const tiles: { tx: number; ty: number; left: number; top: number }[] = [];
  for (let ty = tileYMin; ty <= tileYMax; ty++) {
    for (let tx = tileXMin; tx <= tileXMax; tx++) {
      // Skip tiles outside valid range (poles, antimeridian — won't happen in PH)
      if (tx < 0 || tx > maxTile || ty < 0 || ty > maxTile) continue;
      tiles.push({ tx, ty, left: tx * TILE_SIZE - originX, top: ty * TILE_SIZE - originY });
    }
  }

  const project: ProjectFn = (lat, lng) => ({
    x: worldX(lng, Z) - originX,
    y: worldY(lat, Z) - originY,
  });

  return (
    <div
      className={cn("@container relative w-full overflow-hidden rounded-lg bg-muted", className)}
      style={{ aspectRatio: `${width} / ${height}`, containerType: "inline-size" }}
      aria-label={ariaLabel}
    >
      <div
        className="absolute top-0 left-0 origin-top-left overflow-hidden"
        style={{
          width,
          height,
          transform: `scale(calc(100cqw / ${width}))`,
        }}
      >
        {tiles.map(({ tx, ty, left, top }) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${tx}-${ty}`}
            src={tileUrl(Z, tx, ty)}
            alt=""
            aria-hidden
            draggable={false}
            loading="lazy"
            style={{
              position: "absolute",
              left: Math.round(left),
              top: Math.round(top),
              width: TILE_SIZE,
              height: TILE_SIZE,
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        ))}

        {children(project)}

        <OsmAttribution />
      </div>
    </div>
  );
}

/** Round pin dot centred on a projected point. */
export function StaticPinDot({
  point,
  radius,
  color,
}: {
  point: CanvasPoint;
  radius: number;
  color: string;
}) {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        display: "block",
        left: Math.round(point.x) - radius,
        top: Math.round(point.y) - radius,
        width: radius * 2,
        height: radius * 2,
        borderRadius: "50%",
        backgroundColor: color,
        border: "2px solid white",
        boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
        pointerEvents: "none",
      }}
    />
  );
}

/** Required OSM attribution (tile usage policy), bottom-right of the canvas. */
export function OsmAttribution() {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 3,
        right: 3,
        fontSize: 10,
        lineHeight: "1.2",
        background: "rgba(255,255,255,0.8)",
        padding: "1px 4px",
        borderRadius: 2,
        pointerEvents: "none",
        userSelect: "none",
      }}
      aria-hidden
    >
      ©{" "}
      <a
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noreferrer"
        style={{ pointerEvents: "auto", color: "inherit" }}
      >
        OpenStreetMap
      </a>{" "}
      contributors
    </div>
  );
}

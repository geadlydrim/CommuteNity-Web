/**
 * StaticRouteMap — renders a route preview using plain <img> OSM tiles.
 *
 * NO WebGL, NO map library — just Web Mercator math and raster tiles.
 * Safe to use in any quantity (the feed renders one per post with a map).
 *
 * ESCAPE HATCH: If the tile math proves unreliable for edge cases, swap
 * the internals to render a single <img> pointing at a proxied static-map
 * endpoint (e.g. /api/staticmap?pins=…). The component props are stable
 * so PostCard never needs to change.
 *
 * OSM tile usage policy: attribution is required (rendered bottom-right).
 * These tiles are suitable for dev / low-traffic; swap to a self-hosted
 * proxy or MapTiler/Protomaps under load.
 */
import { cn } from "@/lib/utils";
import { fitPinsToView, worldX, worldY } from "./route-geometry";
import type { MapPin } from "@/lib/schemas/post-map";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TILE_SIZE = 256;
const PIN_RADIUS = 6;

// role → color (derived from pin index, not stored in map_data)
const PIN_COLORS = {
  origin: "#22c55e",      // green-500
  destination: "#ef4444", // red-500
  waypoint: "#6b7280",    // gray-500
} as const;

function pinColor(index: number, total: number): string {
  if (index === 0) return PIN_COLORS.origin;
  if (index === total - 1) return PIN_COLORS.destination;
  return PIN_COLORS.waypoint;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface StaticRouteMapProps {
  pins: MapPin[];
  width?: number;
  height?: number;
  className?: string;
}

export function StaticRouteMap({
  pins,
  width = 600,
  height = 240,
  className,
}: StaticRouteMapProps) {
  if (pins.length === 0) return null;

  // --- Fit all pins into the container ---
  const { longitude: cLng, latitude: cLat, zoom: Z } = fitPinsToView(
    pins,
    width,
    height
  );

  // World-pixel origin of the container's top-left corner
  const cx = worldX(cLng, Z);
  const cy = worldY(cLat, Z);
  const originX = cx - width / 2;
  const originY = cy - height / 2;

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
      tiles.push({
        tx,
        ty,
        left: tx * TILE_SIZE - originX,
        top: ty * TILE_SIZE - originY,
      });
    }
  }

  // --- Project pins to container pixels ---
  const projected = pins.map((p) => ({
    x: worldX(p.lng, Z) - originX,
    y: worldY(p.lat, Z) - originY,
  }));

  // SVG polyline points string
  const polylinePoints = projected.map(({ x, y }) => `${x},${y}`).join(" ");

  return (
    <div
      className={cn(
        "@container relative w-full overflow-hidden rounded-lg bg-muted",
        className,
      )}
      style={{ aspectRatio: `${width} / ${height}`, containerType: "inline-size" }}
      aria-label="Route map preview"
    >
      <div
        className="absolute top-0 left-0 origin-top-left overflow-hidden"
        style={{
          width,
          height,
          transform: `scale(calc(100cqw / ${width}))`,
        }}
      >
      {/* OSM raster tiles */}
      {tiles.map(({ tx, ty, left, top }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${tx}-${ty}`}
          src={`https://tile.openstreetmap.org/${Z}/${tx}/${ty}.png`}
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

      {/* Route connecting line */}
      {pins.length > 1 && (
        <svg
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          width={width}
          height={height}
          aria-hidden
        >
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity={0.9}
          />
        </svg>
      )}

      {/* Pin markers */}
      {projected.map(({ x, y }, i) => (
        <div
          key={i}
          aria-hidden
          style={{
            position: "absolute",
            left: Math.round(x) - PIN_RADIUS,
            top: Math.round(y) - PIN_RADIUS,
            width: PIN_RADIUS * 2,
            height: PIN_RADIUS * 2,
            borderRadius: "50%",
            backgroundColor: pinColor(i, pins.length),
            border: "2px solid white",
            boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
            pointerEvents: "none",
          }}
        />
      ))}

      {/* Required OSM attribution (tile usage policy) */}
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
      </div>
    </div>
  );
}

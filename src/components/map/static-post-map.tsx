/**
 * StaticPostMap — post map thumbnail: the pins and the line through them
 * (each pair's stored street path, or a straight line when it has none),
 * drawn on the shared StaticTileCanvas (no WebGL; safe once per feed post).
 */
import { POST_MAP_LINE_COLOR, pinColor } from "@/lib/map/colors";
import type { MapData } from "@/lib/schemas/post-map";
import { fitPostMapToView, postMapLinePoints } from "./post-map-geometry";
import { StaticPinDot, StaticTileCanvas } from "./static-tile-canvas";

const PIN_RADIUS = 6;

export interface StaticPostMapProps {
  map: MapData;
  width?: number;
  height?: number;
  className?: string;
}

export function StaticPostMap({
  map,
  width = 600,
  height = 240,
  className,
}: StaticPostMapProps) {
  const { pins } = map;
  if (pins.length === 0) return null;

  return (
    <StaticTileCanvas
      fit={fitPostMapToView(map, width, height)}
      width={width}
      height={height}
      ariaLabel="Post map preview"
      className={className}
    >
      {(project) => {
        const line = postMapLinePoints(map).map((p) => project(p.lat, p.lng));
        const projected = pins.map((p) => project(p.lat, p.lng));
        return (
          <>
            {pins.length > 1 && (
              <svg
                style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
                width={width}
                height={height}
                aria-hidden
              >
                <polyline
                  points={line.map(({ x, y }) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={POST_MAP_LINE_COLOR}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={0.9}
                />
              </svg>
            )}
            {projected.map((point, i) => (
              <StaticPinDot
                key={i}
                point={point}
                radius={PIN_RADIUS}
                color={pinColor(i, pins.length)}
              />
            ))}
          </>
        );
      }}
    </StaticTileCanvas>
  );
}

/**
 * StaticPostMap — post map thumbnail: the pins and the line through them,
 * drawn on the shared StaticTileCanvas (no WebGL; safe once per feed post).
 */
import { POST_MAP_LINE_COLOR, pinColor } from "@/lib/map/colors";
import type { MapPin } from "@/lib/schemas/post-map";
import { fitPinsToView } from "./post-map-geometry";
import { StaticPinDot, StaticTileCanvas } from "./static-tile-canvas";

const PIN_RADIUS = 6;

export interface StaticPostMapProps {
  pins: MapPin[];
  width?: number;
  height?: number;
  className?: string;
}

export function StaticPostMap({
  pins,
  width = 600,
  height = 240,
  className,
}: StaticPostMapProps) {
  if (pins.length === 0) return null;

  return (
    <StaticTileCanvas
      fit={fitPinsToView(pins, width, height)}
      width={width}
      height={height}
      ariaLabel="Post map preview"
      className={className}
    >
      {(project) => {
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
                  points={projected.map(({ x, y }) => `${x},${y}`).join(" ")}
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

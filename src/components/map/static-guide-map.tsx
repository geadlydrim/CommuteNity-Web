/**
 * StaticGuideMap — guide thumbnail on the shared StaticTileCanvas: one solid
 * line per leg in its mode colour, dashed transfer lines, and origin /
 * destination dots per leg. No WebGL.
 */
import { PIN_COLORS } from "@/lib/map/colors";
import type { GuideMapData } from "@/lib/schemas/guide-map";
import { guideMapFit, legSegments, connectorSegments } from "./guide-geometry";
import { StaticPinDot, StaticTileCanvas, type CanvasPoint } from "./static-tile-canvas";

const PIN_RADIUS = 5;

interface StaticGuideMapProps {
  data: GuideMapData;
  width?: number;
  height?: number;
  className?: string;
}

export function StaticGuideMap({
  data,
  width = 600,
  height = 240,
  className,
}: StaticGuideMapProps) {
  const { legs, connectors } = data;
  if (legs.length === 0) return null;

  return (
    <StaticTileCanvas
      fit={guideMapFit(legs, width, height)}
      width={width}
      height={height}
      ariaLabel="Guide route preview"
      className={className}
    >
      {(project) => {
        // Segment coords are [lng, lat] pairs.
        const ends = (coords: [number, number][]): [CanvasPoint, CanvasPoint] | null => {
          const [a, b] = coords;
          return a && b ? [project(a[1], a[0]), project(b[1], b[0])] : null;
        };
        return (
          <>
            <svg
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
              width={width}
              height={height}
              aria-hidden
            >
              {/* Leg lines — solid */}
              {legSegments(legs).map((seg, i) => {
                const line = ends(seg.coords);
                if (!line) return null;
                const [a, b] = line;
                return (
                  <line
                    key={`leg-${i}`}
                    x1={a.x} y1={a.y}
                    x2={b.x} y2={b.y}
                    stroke={seg.color}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    opacity={0.9}
                  />
                );
              })}
              {/* Transfer lines — dashed */}
              {connectorSegments(legs, connectors).map((seg, i) => {
                const line = ends(seg.coords);
                if (!line) return null;
                const [a, b] = line;
                return (
                  <line
                    key={`conn-${i}`}
                    x1={a.x} y1={a.y}
                    x2={b.x} y2={b.y}
                    stroke={seg.color}
                    strokeWidth={2}
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                    opacity={0.75}
                  />
                );
              })}
            </svg>

            {legs.map((leg, i) => (
              <span key={i}>
                <StaticPinDot
                  point={project(leg.origin.lat, leg.origin.lng)}
                  radius={PIN_RADIUS}
                  color={PIN_COLORS.origin}
                />
                <StaticPinDot
                  point={project(leg.destination.lat, leg.destination.lng)}
                  radius={PIN_RADIUS}
                  color={PIN_COLORS.destination}
                />
              </span>
            ))}
          </>
        );
      }}
    </StaticTileCanvas>
  );
}

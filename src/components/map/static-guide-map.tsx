/**
 * StaticGuideMap — renders a guide route preview using plain <img> OSM tiles.
 *
 * NO WebGL. Mirrors StaticRouteMap but renders multiple colored leg lines
 * (solid) and connector transfer lines (dashed SVG stroke-dasharray).
 *
 * OSM tile usage policy: attribution is required (rendered bottom-right).
 */
import { cn } from "@/lib/utils";
import type { GuideMapData } from "@/lib/schemas/guide-map";
import { worldX, worldY, guideMapFit, legSegments, connectorSegments } from "./guide-geometry";

const TILE_SIZE = 256;
const PIN_RADIUS = 5;

// Origin / destination pin colors (per-leg, index within leg)
const ORIGIN_COLOR = "#22c55e";     // green-500
const DEST_COLOR = "#ef4444";       // red-500

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

  const { longitude: cLng, latitude: cLat, zoom: Z } = guideMapFit(legs, width, height);

  // World-pixel origin of top-left corner
  const cx = worldX(cLng, Z);
  const cy = worldY(cLat, Z);
  const originX = cx - width / 2;
  const originY = cy - height / 2;

  // Tile range
  const maxTile = Math.pow(2, Z) - 1;
  const tileXMin = Math.floor(originX / TILE_SIZE);
  const tileXMax = Math.floor((originX + width - 1) / TILE_SIZE);
  const tileYMin = Math.floor(originY / TILE_SIZE);
  const tileYMax = Math.floor((originY + height - 1) / TILE_SIZE);

  const tiles: { tx: number; ty: number; left: number; top: number }[] = [];
  for (let ty = tileYMin; ty <= tileYMax; ty++) {
    for (let tx = tileXMin; tx <= tileXMax; tx++) {
      if (tx < 0 || tx > maxTile || ty < 0 || ty > maxTile) continue;
      tiles.push({ tx, ty, left: tx * TILE_SIZE - originX, top: ty * TILE_SIZE - originY });
    }
  }

  // Project [lng, lat] pair to container pixels
  const project = ([lng, lat]: [number, number]) => ({
    x: worldX(lng, Z) - originX,
    y: worldY(lat, Z) - originY,
  });

  const allLegSegs = legSegments(legs);
  const allConnSegs = connectorSegments(legs, connectors);

  // Project each leg's origin + destination for pin dots
  const legPins = legs.map((l) => ({
    origin: project([l.origin.lng, l.origin.lat]),
    dest: project([l.destination.lng, l.destination.lat]),
  }));

  return (
    <div
      className={cn(
        "@container relative w-full overflow-hidden rounded-lg bg-muted",
        className,
      )}
      style={{ aspectRatio: `${width} / ${height}`, containerType: "inline-size" }}
      aria-label="Guide route preview"
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

      {/* SVG lines */}
      <svg
        style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        width={width}
        height={height}
        aria-hidden
      >
        {/* Leg lines — solid */}
        {allLegSegs.map((seg, i) => {
          const [a, b] = seg.coords.map(project);
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
        {/* Connector lines — dashed */}
        {allConnSegs.map((seg, i) => {
          const [a, b] = seg.coords.map(project);
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

      {/* Pin dots */}
      {legPins.map(({ origin, dest }, i) => (
        <span key={i}>
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: Math.round(origin.x) - PIN_RADIUS,
              top: Math.round(origin.y) - PIN_RADIUS,
              width: PIN_RADIUS * 2,
              height: PIN_RADIUS * 2,
              borderRadius: "50%",
              backgroundColor: ORIGIN_COLOR,
              border: "2px solid white",
              boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
              pointerEvents: "none",
              display: "block",
            }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: Math.round(dest.x) - PIN_RADIUS,
              top: Math.round(dest.y) - PIN_RADIUS,
              width: PIN_RADIUS * 2,
              height: PIN_RADIUS * 2,
              borderRadius: "50%",
              backgroundColor: DEST_COLOR,
              border: "2px solid white",
              boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
              pointerEvents: "none",
              display: "block",
            }}
          />
        </span>
      ))}

      {/* Required OSM attribution */}
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

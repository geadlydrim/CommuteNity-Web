/**
 * PROTOTYPE — throwaway. Builds `sample-guide.json`: one leg per mode across
 * Metro Manila, road legs routed by the local Valhalla (127.0.0.1:8002), rail
 * legs sliced from the committed rail file. Run:
 *   npx vite-node src/components/map/basemap-prototype/make-sample-guide.ts
 */
import { writeFileSync } from "node:fs";
import { loadRail } from "@/lib/rail/load";
import { sliceRail } from "@/lib/rail/slice";
import { decodePath6, encodePath, type LatLng } from "@/lib/map/path";
import type { TransportMode } from "@/lib/schemas/modes";

type Leg = { mode: TransportMode; from: LatLng; to: LatLng };

const P = (lat: number, lng: number): LatLng => ({ lat, lng });
const LEGS: Leg[] = [
  { mode: "walking", from: P(14.5986, 120.9838), to: P(14.5992, 120.9813) }, // Quiapo Church → Carriedo
  { mode: "lrt", from: P(14.5992, 120.9813), to: P(14.5387, 121.0006) }, // Carriedo → EDSA (LRT-1)
  { mode: "mrt", from: P(14.5376, 121.0016), to: P(14.5493, 121.0279) }, // Taft Avenue → Ayala (MRT-3)
  { mode: "bus", from: P(14.5497, 121.0275), to: P(14.5502, 121.0503) }, // Ayala → BGC
  { mode: "uv_express", from: P(14.5510, 121.0498), to: P(14.5866, 121.0612) }, // BGC → Ortigas
  { mode: "p2p", from: P(14.5872, 121.0605), to: P(14.6197, 121.0526) }, // Ortigas → Cubao
  { mode: "jeepney", from: P(14.6203, 121.0517), to: P(14.6301, 121.0335) }, // Cubao → Kamuning area
  { mode: "tricycle", from: P(14.6305, 121.0329), to: P(14.6352, 121.0298) }, // short ride
];

const COSTING: Partial<Record<TransportMode, { costing: string; highways: number }>> = {
  walking: { costing: "pedestrian", highways: 1 },
  jeepney: { costing: "auto", highways: 0 },
  bus: { costing: "auto", highways: 0 },
  tricycle: { costing: "auto", highways: 0 },
  uv_express: { costing: "auto", highways: 1 },
  p2p: { costing: "auto", highways: 1 },
};

async function route(leg: Leg): Promise<LatLng[]> {
  const c = COSTING[leg.mode]!;
  const res = await fetch("http://127.0.0.1:8002/route", {
    method: "POST",
    body: JSON.stringify({
      locations: [leg.from, leg.to].map((p) => ({ lat: p.lat, lon: p.lng })),
      costing: c.costing,
      costing_options: c.costing === "auto" ? { auto: { use_highways: c.highways, use_tolls: c.highways } } : undefined,
    }),
  });
  const json = (await res.json()) as { trip: { legs: { shape: string }[] } };
  return decodePath6(json.trip.legs[0]!.shape);
}

const rail = await loadRail();
const out = [];
for (const leg of LEGS) {
  let points: LatLng[];
  if (leg.mode === "lrt" || leg.mode === "mrt") {
    const s = sliceRail(rail, leg.mode, leg.from, leg.to);
    if (!s.ok) throw new Error(`${leg.mode}: ${s.reason}`);
    points = s.points;
  } else {
    points = await route(leg);
  }
  out.push({ mode: leg.mode, origin: leg.from, destination: leg.to, path: encodePath(points) });
}
writeFileSync(new URL("./sample-guide.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(out.map((l) => `${l.mode} ${l.path.length}`).join("\n"));

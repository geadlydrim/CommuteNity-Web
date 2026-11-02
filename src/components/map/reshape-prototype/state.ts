"use client";
/** PROTOTYPE — throwaway (issue #4) */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_VIAS_PER_LEG,
  type LegRoute,
  type LngLat,
  type NearestInsertIndex,
  type ProtoLeg,
  type Via,
  type ViaState,
} from "./contract";

// ---------------------------------------------------------------------------
// Vias + undo
// ---------------------------------------------------------------------------

type ViaMap = Record<string, Via[]>;
type Snapshot = { vias: ViaMap; past: ViaMap[] };

const MAX_UNDO = 50;

/**
 * Per-leg via arrays with an undo stack. Pass the current leg ids so vias of
 * legs that disappear are dropped (without an undo entry).
 */
export function useViaState(legIds: string[] = []): ViaState {
  const [snap, setSnap] = useState<Snapshot>({ vias: {}, past: [] });
  // Mirror so mutators can validate and return synchronously.
  const ref = useRef(snap);
  const commit = useCallback((next: Snapshot) => {
    ref.current = next;
    setSnap(next);
  }, []);

  const idsKey = legIds.join("|");
  useEffect(() => {
    const keep = new Set(idsKey ? idsKey.split("|") : []);
    const cur = ref.current;
    if (Object.keys(cur.vias).every((id) => keep.has(id))) return;
    const prune = (m: ViaMap) =>
      Object.fromEntries(Object.entries(m).filter(([id]) => keep.has(id))) as ViaMap;
    commit({ vias: prune(cur.vias), past: cur.past.map(prune) });
  }, [idsKey, commit]);

  const mutate = useCallback(
    (legId: string, fn: (list: Via[]) => Via[]) => {
      const cur = ref.current;
      const next = fn(cur.vias[legId] ?? []);
      commit({
        vias: { ...cur.vias, [legId]: next },
        past: [...cur.past, cur.vias].slice(-MAX_UNDO),
      });
    },
    [commit]
  );

  const addVia = useCallback(
    (legId: string, index: number, point: LngLat) => {
      if ((ref.current.vias[legId]?.length ?? 0) >= MAX_VIAS_PER_LEG) return false;
      mutate(legId, (list) => {
        const at = Math.max(0, Math.min(index, list.length));
        const via: Via = { id: crypto.randomUUID(), lat: point.lat, lng: point.lng };
        return [...list.slice(0, at), via, ...list.slice(at)];
      });
      return true;
    },
    [mutate]
  );

  const moveVia = useCallback(
    (legId: string, viaId: string, point: LngLat) =>
      mutate(legId, (list) =>
        list.map((v) => (v.id === viaId ? { ...v, lat: point.lat, lng: point.lng } : v))
      ),
    [mutate]
  );

  const removeVia = useCallback(
    (legId: string, viaId: string) => mutate(legId, (list) => list.filter((v) => v.id !== viaId)),
    [mutate]
  );

  const undo = useCallback(() => {
    const cur = ref.current;
    const prev = cur.past[cur.past.length - 1];
    if (!prev) return;
    commit({ vias: prev, past: cur.past.slice(0, -1) });
  }, [commit]);

  return useMemo(
    () => ({
      vias: snap.vias,
      addVia,
      moveVia,
      removeVia,
      undo,
      canUndo: snap.past.length > 0,
    }),
    [snap, addVia, moveVia, removeVia, undo]
  );
}

// ---------------------------------------------------------------------------
// Nearest segment
// ---------------------------------------------------------------------------

export const nearestInsertIndex: NearestInsertIndex = (leg, vias, point) => {
  const pts: LngLat[] = [leg.origin, ...vias, leg.destination];
  const k = Math.cos((point.lat * Math.PI) / 180);
  const px = point.lng * k;
  const py = point.lat;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const ax = a.lng * k;
    const ay = a.lat;
    const dx = b.lng * k - ax;
    const dy = b.lat - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const ex = px - (ax + t * dx);
    const ey = py - (ay + t * dy);
    const d = ex * ex + ey * ey;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
};

// ---------------------------------------------------------------------------
// Fake routing
// ---------------------------------------------------------------------------

const ROUTING_MS = 450;

const pair = (p: LngLat): [number, number] => [p.lng, p.lat];

function legSignature(leg: ProtoLeg, vias: Via[], fail: boolean): string {
  return [leg.origin, ...vias, leg.destination].map((p) => `${p.lng},${p.lat}`).join(";") + (fail ? "|F" : "");
}

export function useFakeRouting(
  legs: ProtoLeg[],
  vias: Record<string, Via[]>,
  { fail }: { fail: boolean }
): Record<string, LegRoute> {
  const [routes, setRoutes] = useState<Record<string, LegRoute>>({});
  const sigs = useRef(new Map<string, string>());
  const seqs = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const live = new Set(legs.map((l) => l.id));
    for (const leg of legs) {
      const list = vias[leg.id] ?? [];
      const sig = legSignature(leg, list, fail);
      if (sigs.current.get(leg.id) === sig) continue;
      sigs.current.set(leg.id, sig);
      const seq = (seqs.current.get(leg.id) ?? 0) + 1;
      seqs.current.set(leg.id, seq);
      clearTimeout(timers.current.get(leg.id));

      const through = [leg.origin, ...list, leg.destination].map(pair);
      const straight = [pair(leg.origin), pair(leg.destination)];
      setRoutes((prev) => ({
        ...prev,
        [leg.id]: { status: "routing", coords: prev[leg.id]?.coords ?? through },
      }));
      timers.current.set(
        leg.id,
        setTimeout(() => {
          if (seqs.current.get(leg.id) !== seq) return;
          setRoutes((prev) => ({
            ...prev,
            [leg.id]: fail
              ? { status: "failed", coords: straight }
              : { status: "ok", coords: through },
          }));
        }, ROUTING_MS)
      );
    }
    for (const id of [...sigs.current.keys()]) {
      if (live.has(id)) continue;
      sigs.current.delete(id);
      seqs.current.delete(id);
      clearTimeout(timers.current.get(id));
      timers.current.delete(id);
    }
  }, [legs, vias, fail]);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((h) => clearTimeout(h));
  }, []);

  return useMemo(() => {
    const live = new Set(legs.map((l) => l.id));
    return Object.fromEntries(Object.entries(routes).filter(([id]) => live.has(id)));
  }, [routes, legs]);
}

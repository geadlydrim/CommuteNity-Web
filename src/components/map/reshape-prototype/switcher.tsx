"use client";
/** PROTOTYPE — throwaway (issue #4) */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LegRoute, ProtoLeg, VariantKey, Via } from "./contract";

const KEYS: VariantKey[] = ["A", "B", "C"];
export const VARIANT_NAMES: Record<VariantKey, string> = {
  A: "Drag the line",
  B: "Midpoint handles",
  C: "Reshape mode",
};

export function Switcher({
  variant,
  legs,
  vias,
  routes,
  fail,
  onFailChange,
}: {
  variant: VariantKey;
  legs: ProtoLeg[];
  vias: Record<string, Via[]>;
  routes: Record<string, LegRoute>;
  fail: boolean;
  onFailChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [showState, setShowState] = useState(false);
  const pill = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  function go(delta: number) {
    const next = KEYS[(KEYS.indexOf(variant) + delta + KEYS.length) % KEYS.length]!;
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.closest("input, textarea, select") || el.isContentEditable)) return;
      goRef.current(e.key === "ArrowLeft" ? -1 : 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The Radix dialog dismisses on document-level pointerdown outside its content
  // and blocks wheel/touch outside it; stop those natively at the pill.
  useEffect(() => {
    const el = pill.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    const events = ["pointerdown", "wheel", "touchmove"];
    events.forEach((n) => el.addEventListener(n, stop));
    return () => events.forEach((n) => el.removeEventListener(n, stop));
  }, [mounted]);

  if (!mounted) return null;

  return createPortal(
    <div
      ref={pill}
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto fixed bottom-4 left-1/2 z-[100] w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-2xl bg-black text-white shadow-2xl ring-2 ring-fuchsia-500"
    >
      <div className="flex items-center gap-1 p-1.5">
        <button
          type="button"
          aria-label="Previous variant"
          onClick={() => go(-1)}
          className="h-9 w-9 rounded-full text-lg hover:bg-white/20"
        >
          ←
        </button>
        <div className="min-w-44 px-1 text-center text-sm font-semibold">
          {variant} ({VARIANT_NAMES[variant]})
        </div>
        <button
          type="button"
          aria-label="Next variant"
          onClick={() => go(1)}
          className="h-9 w-9 rounded-full text-lg hover:bg-white/20"
        >
          →
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-white/20 px-3 py-1.5 text-xs">
        <label className="flex min-h-7 cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={fail}
            onChange={(e) => onFailChange(e.target.checked)}
            className="h-4 w-4 accent-fuchsia-500"
          />
          Simulate routing failure
        </label>
        <button
          type="button"
          onClick={() => setShowState((s) => !s)}
          className="min-h-7 px-1 underline underline-offset-2"
        >
          state {showState ? "▾" : "▸"}
        </button>
      </div>
      {showState && (
        <div className="max-h-48 overflow-y-auto border-t border-white/20 px-3 py-2 font-mono text-[11px] leading-snug">
          {legs.length === 0 && <div className="opacity-70">No placed legs.</div>}
          {legs.map((l) => {
            const list = vias[l.id] ?? [];
            return (
              <div key={l.id} className="mb-1.5">
                <div>
                  Leg {l.index}: {routes[l.id]?.status ?? "ok"} · {list.length} via
                  {list.length === 1 ? "" : "s"}
                </div>
                {list.map((v, i) => (
                  <div key={v.id} className="pl-3 opacity-80">
                    {i + 1}. {v.lat.toFixed(5)}, {v.lng.toFixed(5)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>,
    document.body
  );
}

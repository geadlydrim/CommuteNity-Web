"use client";
/**
 * PROTOTYPE — throwaway. Floating bar to flip base map variants (`?variant=`)
 * and themes. Hidden in production builds.
 */
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { VARIANTS, type Theme, type Variant } from "./styles";

const KEYS = Object.keys(VARIANTS) as Variant[];

export function useBasemapPrototype(): { variant: Variant; theme: Theme } {
  const params = useSearchParams();
  const { resolvedTheme } = useTheme();
  const v = params.get("variant");
  const variant = (KEYS as string[]).includes(v ?? "") ? (v as Variant) : "A";
  return { variant, theme: resolvedTheme === "dark" ? "dark" : "light" };
}

export function BasemapPrototypeSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { variant, theme } = useBasemapPrototype();
  const { setTheme } = useTheme();

  const go = (step: number) => {
    const i = (KEYS.indexOf(variant) + step + KEYS.length) % KEYS.length;
    const next = new URLSearchParams(params.toString());
    next.set("variant", KEYS[i]!);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest("input, textarea, [contenteditable]"))) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black px-3 py-2 text-sm text-white shadow-xl ring-2 ring-fuchsia-500">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant" className="px-2">←</button>
      <span className="min-w-[220px] text-center">
        {variant} ({VARIANTS[variant]})
      </span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant" className="px-2">→</button>
      <button
        type="button"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="ml-2 rounded-full bg-white/15 px-2 py-0.5"
      >
        {theme}
      </button>
    </div>
  );
}

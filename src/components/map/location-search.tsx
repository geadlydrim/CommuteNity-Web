"use client";
/**
 * LocationSearch — debounced geocode search input + two-line result dropdown.
 *
 * Extracted from SlotRow in route-map-builder so both the commuter builder
 * (RouteMapBuilder) and the guide builder (GuideMapBuilder) share one
 * implementation.
 *
 * Owns its own query / results / debounce / abort state. Calls `onPick` when
 * the user selects a result and resets its own state afterwards.
 */
import { useRef, useState } from "react";
import { Search } from "lucide-react";
import { geocode } from "@/lib/geo";
import type { GeocodeResult } from "@/lib/geo/types";

interface LocationSearchProps {
  placeholder?: string;
  onPick: (result: GeocodeResult) => void;
  onFocus?: () => void;
}

export function LocationSearch({ placeholder = "Search location…", onPick, onFocus }: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  function handleQueryChange(text: string) {
    setQuery(text);
    setShowDropdown(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      try {
        const r = await geocode(text.trim(), { limit: 6, signal: abortRef.current.signal });
        setResults(r);
        setShowDropdown(r.length > 0);
      } catch {
        // aborted / network — ignore
      } finally {
        setIsSearching(false);
      }
    }, 350);
  }

  function pick(result: GeocodeResult) {
    onPick(result);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground md:top-2" />
      <input
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onFocus={() => {
          onFocus?.();
          if (results.length > 0) setShowDropdown(true);
        }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        onClick={(e) => e.stopPropagation()}
        placeholder={placeholder}
        className="w-full rounded border bg-background py-2 pl-8 pr-6 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring md:py-1.5 md:text-xs"
      />
      {isSearching && (
        <span className="absolute right-2.5 top-2 text-xs text-muted-foreground">…</span>
      )}
      {showDropdown && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={i}
              className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors"
              title={r.fullName}
              onMouseDown={(e) => {
                // mousedown fires before blur — prevent the blur from hiding dropdown
                e.preventDefault();
                pick(r);
              }}
            >
              <span className="block font-medium leading-tight">{r.displayName}</span>
              {(r.detailName || r.secondaryName) && (
                <span className="block text-muted-foreground leading-tight mt-0.5">
                  {r.detailName ?? r.secondaryName}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

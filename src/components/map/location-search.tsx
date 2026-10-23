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
 *
 * Accessibility: WAI-ARIA 1.2 combobox with a listbox popup. Focus stays in
 * the input; ArrowDown/ArrowUp move the highlighted option (wrapping) via
 * `aria-activedescendant`, Enter picks it, Escape closes the list.
 *
 * Lifecycle: unmounting clears the debounce and blur timers and aborts the
 * in-flight request. Only the latest request may update results or the
 * spinner; superseded requests are aborted and their outcome ignored.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { geocode } from "@/lib/geo";
import type { GeocodeResult } from "@/lib/geo/types";
import { cn } from "@/lib/utils";

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
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const blurRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;
  const isOpen = showDropdown && results.length > 0;

  // Nothing outlives the component: timers cleared, in-flight request aborted.
  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
      clearTimeout(blurRef.current);
      abortRef.current?.abort();
    };
  }, []);

  // Both builders live inside a Radix Dialog, which dismisses on Escape from a
  // document-level capture listener (before React's handlers run). While the
  // list is open, mark Escape from this input as handled at the window capture
  // phase so the first Escape only closes the list, not the whole builder.
  useEffect(() => {
    if (!isOpen) return;
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape" && event.target === inputRef.current) event.preventDefault();
    }
    window.addEventListener("keydown", handleEscape, { capture: true });
    return () => window.removeEventListener("keydown", handleEscape, { capture: true });
  }, [isOpen]);

  // Keep the highlighted option visible inside the scrollable list.
  useEffect(() => {
    if (!isOpen || activeIndex < 0) return;
    const option = listboxRef.current?.children[activeIndex];
    if (option instanceof HTMLElement) option.scrollIntoView({ block: "nearest" });
  }, [isOpen, activeIndex]);

  /** Abort the in-flight request; its outcome will be ignored. */
  function cancelRequest() {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsSearching(false);
  }

  function handleQueryChange(text: string) {
    setQuery(text);
    setShowDropdown(false);
    setActiveIndex(-1);
    clearTimeout(debounceRef.current);
    cancelRequest();
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSearching(true);
      try {
        const r = await geocode(text.trim(), { limit: 6, signal: controller.signal });
        if (controller.signal.aborted) return;
        setResults(r);
        setActiveIndex(-1);
        setShowDropdown(r.length > 0);
      } catch {
        // aborted / network — ignore
      } finally {
        // A superseded or aborted request no longer owns the spinner.
        if (abortRef.current === controller) {
          abortRef.current = null;
          setIsSearching(false);
        }
      }
    }, 350);
  }

  function pick(result: GeocodeResult) {
    onPick(result);
    setQuery("");
    setResults([]);
    setShowDropdown(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (results.length === 0) return;
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        if (!isOpen) {
          setShowDropdown(true);
          setActiveIndex(step === 1 ? 0 : results.length - 1);
          return;
        }
        setActiveIndex((i) => {
          if (i < 0) return step === 1 ? 0 : results.length - 1;
          return (i + step + results.length) % results.length;
        });
        return;
      }
      case "Enter": {
        // Never submit a surrounding form from the search box.
        e.preventDefault();
        const picked = results[activeIndex];
        if (isOpen && picked) pick(picked);
        return;
      }
      case "Escape": {
        // With the list closed, Escape falls through to the builder dialog.
        if (!isOpen) return;
        setShowDropdown(false);
        setActiveIndex(-1);
        return;
      }
    }
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-2.5 left-2.5 h-3.5 w-3.5 text-muted-foreground md:top-2" />
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-busy={isSearching}
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          clearTimeout(blurRef.current);
          onFocus?.();
          if (results.length > 0) setShowDropdown(true);
        }}
        onBlur={() => {
          clearTimeout(blurRef.current);
          blurRef.current = setTimeout(() => {
            setShowDropdown(false);
            setActiveIndex(-1);
          }, 200);
        }}
        onClick={(e) => e.stopPropagation()}
        placeholder={placeholder}
        className="w-full rounded border bg-background py-2 pl-8 pr-6 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring md:py-1.5 md:text-xs"
      />
      {isSearching && (
        <span className="absolute right-2.5 top-2 text-xs text-muted-foreground" aria-hidden="true">…</span>
      )}
      <ul
        ref={listboxRef}
        id={listboxId}
        role="listbox"
        aria-label={placeholder}
        hidden={!isOpen}
        // Keep focus in the input when clicking the list (incl. its scrollbar).
        onMouseDown={(e) => e.preventDefault()}
        className="absolute left-0 right-0 top-full z-10 mt-1 rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto"
      >
        {isOpen &&
          results.map((r, i) => (
            <li
              key={i}
              id={optionId(i)}
              role="option"
              aria-selected={i === activeIndex}
              className={cn(
                "w-full cursor-pointer text-left px-3 py-2 text-xs hover:bg-accent transition-colors",
                i === activeIndex && "bg-accent",
              )}
              title={r.fullName}
              onMouseMove={() => {
                if (i !== activeIndex) setActiveIndex(i);
              }}
              onMouseDown={(e) => {
                // mousedown fires before blur — keep focus in the input, pick now
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
            </li>
          ))}
      </ul>
    </div>
  );
}

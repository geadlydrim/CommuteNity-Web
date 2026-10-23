"use client";
/**
 * SlotFields — the body both builders' slot rows share: a place search, then
 * the placed pin's editable label, sublabel, and coordinates (or a "not set"
 * note). Each builder wraps it with its own role badge and controls.
 */
import type { GeocodeResult } from "@/lib/geo";
import { LocationSearch } from "./location-search";
import { isPlaced, type EditorSlot } from "./map-editor-state";

interface SlotFieldsProps {
  slot: EditorSlot;
  /** Role name for the search placeholder, e.g. "Origin". */
  role: string;
  onSelect: () => void;
  onPick: (result: GeocodeResult) => void;
  onLabelChange: (label: string) => void;
}

export function SlotFields({ slot, role, onSelect, onPick, onLabelChange }: SlotFieldsProps) {
  return (
    <>
      <div onClick={(e) => e.stopPropagation()}>
        <LocationSearch
          placeholder={`Search ${role.toLowerCase()}…`}
          onPick={onPick}
          onFocus={onSelect}
        />
      </div>

      {isPlaced(slot) ? (
        <>
          <input
            value={slot.label}
            onChange={(e) => onLabelChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder={slot.locating ? "Locating…" : "Place name…"}
            maxLength={120}
            className="w-full rounded border bg-background px-2 py-1 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {slot.sublabel && (
            <p className="text-[10px] text-muted-foreground leading-tight px-0.5">
              {slot.sublabel}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground tabular-nums">
            {slot.lat.toFixed(5)}, {slot.lng.toFixed(5)}
          </p>
        </>
      ) : (
        <p className="text-[10px] text-muted-foreground italic">
          Not set — search above or click the map.
        </p>
      )}
    </>
  );
}

"use client";
/**
 * The pieces of Reshape mode the guide builder draws: the numbered, draggable
 * via markers, the banner over the map, the via panel under the leg being
 * reshaped, and the "old route" notice. All are driven by `useReshape`; the
 * builder only places them.
 */
import { X } from "lucide-react";
import { MAX_VIAS_PER_LEG, type Via } from "@/lib/schemas/guide-map";
import { Marker } from "./primitives";
import { staleViasMessage } from "./reshape-state";

const BUTTON_CLASS =
  "inline-flex min-h-7 items-center justify-center rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50";

// ---------------------------------------------------------------------------
// On the map
// ---------------------------------------------------------------------------

interface ViaMarkersProps {
  vias: readonly Via[];
  /** The leg's mode colour. */
  color: string;
  onDragStart: () => void;
  /** A drag ended: via `index` is now at `point`. */
  onDragEnd: (index: number, point: { lat: number; lng: number }) => void;
}

/** One numbered marker per via, in order; a click on one never reaches the map. */
export function ViaMarkers({ vias, color, onDragStart, onDragEnd }: ViaMarkersProps) {
  return (
    <>
      {vias.map((via, i) => (
        <Marker
          // A via has no id: its place in the list is its identity.
          key={i}
          longitude={via.lng}
          latitude={via.lat}
          draggable
          onClick={(e) => e.originalEvent.stopPropagation()}
          onDragStart={onDragStart}
          onDragEnd={(e) => onDragEnd(i, { lat: e.lngLat.lat, lng: e.lngLat.lng })}
        >
          <div
            className="flex h-7 w-7 cursor-grab items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow-md active:cursor-grabbing"
            style={{ backgroundColor: color, touchAction: "none" }}
            title={`Via ${i + 1}`}
          >
            {i + 1}
          </div>
        </Marker>
      ))}
    </>
  );
}

/** The banner over the map while a leg is reshaped. */
export function ReshapeBanner({ legNumber, onDone }: { legNumber: number; onDone: () => void }) {
  return (
    <div
      role="status"
      className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border bg-background/95 py-1 pl-3 pr-1 text-xs shadow-md"
    >
      <span>Reshaping Leg {legNumber} — tap the map to add a via</span>
      <button
        onClick={onDone}
        className="min-h-7 shrink-0 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground"
      >
        Done
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// In the panel
// ---------------------------------------------------------------------------

interface ReshapePanelProps {
  legNumber: number;
  /** The leg's mode colour. */
  color: string;
  vias: readonly Via[];
  /** The leg has `MAX_VIAS_PER_LEG`: adding is off. */
  atLimit: boolean;
  canUndo: boolean;
  onRemove: (index: number) => void;
  onUndo: () => void;
  onClearAll: () => void;
  onDone: () => void;
}

/** The via list of the leg being reshaped, with × per via, Undo, Clear all, and Done. */
export function ReshapePanel({
  legNumber,
  color,
  vias,
  atLimit,
  canUndo,
  onRemove,
  onUndo,
  onClearAll,
  onDone,
}: ReshapePanelProps) {
  return (
    <div className="mt-1 space-y-2 rounded-md border bg-card p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">
          Reshaping Leg {legNumber} · {vias.length} {vias.length === 1 ? "via" : "vias"}
        </span>
        <button onClick={onDone} className={BUTTON_CLASS}>
          Done
        </button>
      </div>

      {atLimit ? (
        <p className="font-medium">
          Leg {legNumber} has the maximum {MAX_VIAS_PER_LEG} vias. Remove one to add another.
        </p>
      ) : (
        <p className="text-muted-foreground">Tap the map to add a via. Drag a numbered marker to move it.</p>
      )}

      {vias.length > 0 ? (
        <ol className="space-y-1">
          {vias.map((via, i) => (
            <li key={i} className="flex items-center gap-2 rounded border bg-muted/30 py-0.5 pl-1.5 pr-0.5">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ backgroundColor: color }}
              >
                {i + 1}
              </span>
              <span className="font-medium">Via {i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground">
                {via.lat.toFixed(5)}, {via.lng.toFixed(5)}
              </span>
              <button
                onClick={() => onRemove(i)}
                title={`Remove via ${i + 1}`}
                aria-label={`Remove via ${i + 1}`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-destructive hover:bg-destructive/20"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground">No vias yet.</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <button onClick={onUndo} disabled={!canUndo} className={BUTTON_CLASS}>
          Undo
        </button>
        <button onClick={onClearAll} disabled={vias.length === 0} className={BUTTON_CLASS}>
          Clear all
        </button>
      </div>
    </div>
  );
}

/** Shown on a leg whose pin moved far while it has vias: they were placed for the old route. */
export function StaleViasNotice({ viaCount, onClear }: { viaCount: number; onClear: () => void }) {
  return (
    <div role="status" className="mt-1 flex items-center gap-2 rounded-md border bg-muted/40 p-2 text-xs">
      <p className="min-w-0 flex-1">{staleViasMessage(viaCount)}</p>
      <button onClick={onClear} className={BUTTON_CLASS}>
        Clear vias
      </button>
    </div>
  );
}

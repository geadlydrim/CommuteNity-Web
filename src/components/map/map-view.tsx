"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import Map, {
  NavigationControl,
  type MapLayerMouseEvent,
  type MapRef,
  type ViewState,
} from "react-map-gl/maplibre";
import { cn } from "@/lib/utils";
import { OSM_RASTER_STYLE, DEFAULT_VIEW_STATE } from "./osm-style";

export type { MapRef };

export interface MapViewProps {
  /**
   * Uncontrolled starting camera — merged over Metro Manila defaults.
   * Map owns pan/zoom internally (no controlled viewState wiring).
   */
  initialViewState?: Partial<
    Pick<ViewState, "longitude" | "latitude" | "zoom" | "bearing" | "pitch">
  >;
  /** Tailwind classes for the outer container. Use to override the default height. */
  className?: string;
  /** Click handler on the basemap — use for future pin-drop stop placement. */
  onClick?: (e: MapLayerMouseEvent) => void;
  /** Markers, Popups, Sources, Layers, extra controls. */
  children?: React.ReactNode;
  /** Allow pan / zoom / rotate. Default: true. */
  interactive?: boolean;
  /**
   * When true, one-finger / wheel scroll passes through to the page;
   * the map only pans with two fingers (mobile) or ctrl+wheel (desktop).
   * Use inside scrollable sheets (post focus, comments). Leave off in builders.
   */
  cooperativeGestures?: boolean;
  /** Render the built-in NavigationControl. Default: true. */
  showNavigationControl?: boolean;
  /** Ref forwarded to the underlying MapLibre map instance for imperative control (flyTo, etc.). */
  mapRef?: React.RefObject<MapRef | null>;
}

/**
 * Reusable MapLibre map wrapper.
 *
 * SSR note: `"use client"` is sufficient — react-map-gl initialises the GL
 * instance inside a useEffect. If hydration warnings appear in future, wrap
 * the *consumer* in `next/dynamic({ ssr: false })`, not this module.
 */
export function MapView({
  initialViewState,
  className,
  onClick,
  children,
  interactive = true,
  cooperativeGestures = false,
  showNavigationControl = true,
  mapRef,
}: MapViewProps) {
  return (
    // MapLibre collapses to 0px without an explicitly sized parent.
    // Default h-[400px] makes it "just work" when dropped on any page.
    <div className={cn("h-[400px] w-full", className)}>
      <Map
        ref={mapRef}
        // NOTE: prop is `mapStyle`, NOT `style`. `style` sets canvas container CSS only.
        mapStyle={OSM_RASTER_STYLE}
        initialViewState={{ ...DEFAULT_VIEW_STATE, ...initialViewState }}
        style={{ width: "100%", height: "100%" }}
        interactive={interactive}
        cooperativeGestures={cooperativeGestures}
        onClick={onClick}
        // Leave attributionControl on (default) — it surfaces the legally-required
        // OSM attribution string from the raster source.
      >
        {showNavigationControl && <NavigationControl position="top-right" />}
        {children}
      </Map>
    </div>
  );
}

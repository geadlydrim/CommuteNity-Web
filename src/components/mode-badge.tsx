import {
  Bus,
  Train,
  Car,
  Bike,
  Footprints,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TRANSIT_MODES, type TransitMode } from "@/lib/transit/modes";

const ICONS: Record<string, LucideIcon> = {
  Bus,
  Train,
  Car,
  Bike,
  Footprints,
};

interface ModeBadgeProps {
  mode: TransitMode;
  /** Show icon only — no label text. */
  iconOnly?: boolean;
  className?: string;
}

/**
 * Badge representing a transit mode.
 * Color driven by --mode-* CSS tokens from globals.css.
 * Icon + label sourced from src/lib/transit/modes.ts.
 */
export function ModeBadge({ mode, iconOnly = false, className }: ModeBadgeProps) {
  const config = TRANSIT_MODES[mode];
  const Icon = ICONS[config.icon] ?? Bus;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
      style={{
        backgroundColor: `color-mix(in oklch, var(--${config.cssVar}) 15%, transparent)`,
        color: `var(--${config.cssVar})`,
        border: `1px solid color-mix(in oklch, var(--${config.cssVar}) 30%, transparent)`,
      }}
    >
      <Icon className="h-3 w-3 shrink-0" />
      {!iconOnly && <span>{config.label}</span>}
    </span>
  );
}

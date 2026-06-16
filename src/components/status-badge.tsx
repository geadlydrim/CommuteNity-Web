import { cn } from "@/lib/utils";

export type ContributionStatus = "pending" | "approved" | "rejected" | "cached";

const STATUS_CONFIG: Record<
  ContributionStatus,
  { label: string; cssVar: string }
> = {
  pending:  { label: "Pending",  cssVar: "status-pending" },
  approved: { label: "Approved", cssVar: "status-approved" },
  rejected: { label: "Rejected", cssVar: "status-rejected" },
  cached:   { label: "Cached",   cssVar: "status-cached" },
};

interface StatusBadgeProps {
  status: ContributionStatus;
  className?: string;
}

/**
 * Badge for contribution / content moderation status.
 * Color driven by --status-* CSS tokens from globals.css.
 * Used by route/stop detail, "My Submissions" view (future).
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        className,
      )}
      style={{
        backgroundColor: `color-mix(in oklch, var(--${config.cssVar}) 15%, transparent)`,
        color: `var(--${config.cssVar})`,
        border: `1px solid color-mix(in oklch, var(--${config.cssVar}) 30%, transparent)`,
      }}
    >
      {config.label}
    </span>
  );
}

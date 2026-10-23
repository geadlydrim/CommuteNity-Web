"use client";
/**
 * BuilderShell — the dialog chrome both map builders share: a header with
 * title and description, the map pane beside a side panel (one scroll on
 * mobile, side by side on md+), and a footer with a Save hint on the left,
 * Cancel, and Save.
 */
import { MapPin as MapPinIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface BuilderShellProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** The live map; fills the map pane. */
  map: React.ReactNode;
  /** The builder's own editor (pin slots, legs and transfers). */
  panel: React.ReactNode;
  saveLabel: string;
  canSave: boolean;
  /** Why Save is disabled, shown left of the buttons. */
  hint?: string | null;
  onSave: () => void;
}

export function BuilderShell({
  open,
  onOpenChange,
  title,
  description,
  map,
  panel,
  saveLabel,
  canSave,
  hint,
  onSave,
}: BuilderShellProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex min-h-0 flex-col gap-0 overflow-hidden p-0 inset-0 h-auto max-h-none w-full max-w-none translate-x-0 translate-y-0 rounded-none sm:inset-auto sm:top-1/2 sm:left-1/2 sm:h-[min(80vh,720px)] sm:max-h-[90vh] sm:w-[92vw] sm:max-w-4xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
        showCloseButton={false}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <DialogHeader className="shrink-0 border-b px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
            <DialogTitle className="flex items-center gap-2">
              <MapPinIcon className="h-4 w-4" />
              {title}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {description}
            </DialogDescription>
          </DialogHeader>

          {/* Body: one scroll on mobile (map + panel); side-by-side on md+ */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] md:flex-row md:overflow-hidden">
            <div className="h-[38vh] shrink-0 md:h-auto md:min-h-0 md:flex-1">{map}</div>
            <div className="flex min-h-0 flex-col border-t bg-background md:w-80 md:flex-none md:overflow-hidden md:border-t-0 md:border-l">
              <div className="p-2 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain">
                {panel}
              </div>
            </div>
          </div>

          {/* Footer — plain div (DialogFooter's negative margins break under p-0 parent) */}
          <div className="flex shrink-0 items-center justify-end gap-2 border-t bg-muted/50 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {hint && <p className="mr-auto min-w-0 text-xs text-muted-foreground">{hint}</p>}
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={onSave} disabled={!canSave}>
              {saveLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

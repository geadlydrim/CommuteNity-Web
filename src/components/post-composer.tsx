"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RouteMapBuilder } from "@/components/map/route-map-builder";
import type { MapData } from "@/lib/schemas/post-map";

export function PostComposer({
  avatarUrl,
  displayName,
}: {
  avatarUrl: string | null;
  displayName: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const trimmed = text.trim();

  async function handlePost() {
    setSubmitting(true);
    const supabase = createClient();
    const payload: Record<string, unknown> = { body: trimmed };
    if (mapData) payload.map_data = mapData;

    const { error } = await supabase.from("posts").insert(payload);
    if (error) {
      console.error("[Post] insert failed:", error);
      toast.error("Failed to post. Try again.");
    } else {
      setText("");
      setMapData(null);
      toast.success("Posted!");
      router.refresh();
    }
    setSubmitting(false);
  }

  // Derive summary chip info from mapData
  const origin = mapData?.pins[0];
  const dest = mapData?.pins[mapData.pins.length - 1];
  const waypointCount = mapData ? mapData.pins.length - 2 : 0;

  return (
    <>
      <div className="w-full max-w-[--content-sm] rounded-xl border bg-card p-3 shadow-sm flex flex-col gap-2">
        {/* Input row */}
        <div className="flex items-center gap-3">
          <UserAvatar
            src={avatarUrl}
            name={displayName}
            className="size-10 shrink-0"
          />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's happening on your commute?"
            className="flex-1"
            disabled={submitting}
          />
          <Button onClick={handlePost} disabled={!trimmed || submitting}>
            {submitting ? "Posting…" : "Post"}
          </Button>
        </div>

        {/* Map section */}
        {mapData && origin && dest ? (
          /* Summary chip */
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-xs">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate text-foreground">
              <span className="font-medium">{origin.label}</span>
              {" → "}
              <span className="font-medium">{dest.label}</span>
              {waypointCount > 0 && (
                <span className="text-muted-foreground ml-1">
                  • +{waypointCount} stop{waypointCount > 1 ? "s" : ""}
                </span>
              )}
            </span>
            <button
              onClick={() => setBuilderOpen(true)}
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0 underline"
            >
              Edit
            </button>
            <button
              onClick={() => setMapData(null)}
              className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
              title="Remove map"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          /* Add map button */
          <button
            onClick={() => setBuilderOpen(true)}
            disabled={submitting}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors self-start pl-1 disabled:opacity-50"
          >
            <MapPin className="h-3.5 w-3.5" />
            Add map
          </button>
        )}
      </div>

      <RouteMapBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        initialValue={mapData}
        onSave={setMapData}
      />
    </>
  );
}

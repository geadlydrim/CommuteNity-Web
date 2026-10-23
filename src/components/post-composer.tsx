"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPin, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { riderMessage } from "@/lib/errors";
import { UserAvatar } from "@/components/user-avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
// Loaded on first open so the feed's initial bundle carries no map-builder code.
const RouteMapBuilder = dynamic(
  () => import("@/components/map/route-map-builder").then((m) => m.RouteMapBuilder),
  { ssr: false }
);
import type { MapData } from "@/lib/schemas/post-map";
import { POST_BODY_MAX } from "@/lib/schemas/post";

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
  // Stays mounted after the first open so the dialog's close animation plays.
  const [builderMounted, setBuilderMounted] = useState(false);
  const openBuilder = () => {
    setBuilderMounted(true);
    setBuilderOpen(true);
  };
  const trimmed = text.trim();
  const remaining = POST_BODY_MAX - trimmed.length;
  const canPost = trimmed.length > 0 && remaining >= 0 && !submitting;

  async function handlePost() {
    setSubmitting(true);
    const supabase = createClient();
    const payload: TablesInsert<"posts"> = { body: trimmed };
    if (mapData) payload.map_data = mapData;

    const { error } = await supabase.from("posts").insert(payload);
    if (error) {
      toast.error(riderMessage(error, { fallback: "Failed to post. Try again." }));
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
      <div className="flex w-full flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex items-start gap-3">
          <UserAvatar
            src={avatarUrl}
            name={displayName}
            className="size-9 shrink-0 sm:size-10"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What's happening on your commute?"
              className="w-full"
              disabled={submitting}
            />

            {mapData && origin && dest && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-xs">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-foreground">
                  <span className="font-medium">{origin.label}</span>
                  {" → "}
                  <span className="font-medium">{dest.label}</span>
                  {waypointCount > 0 && (
                    <span className="ml-1 text-muted-foreground">
                      • +{waypointCount} stop{waypointCount > 1 ? "s" : ""}
                    </span>
                  )}
                </span>
                <button
                  onClick={openBuilder}
                  className="shrink-0 text-muted-foreground underline transition-colors hover:text-foreground"
                >
                  Edit
                </button>
                <button
                  onClick={() => setMapData(null)}
                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                  title="Remove map"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              {mapData ? (
                <span />
              ) : (
                <button
                  onClick={openBuilder}
                  disabled={submitting}
                  className="flex items-center gap-1.5 self-start py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  <MapPin className="h-3.5 w-3.5" />
                  Add map
                </button>
              )}
              <span
                className={`ml-auto text-xs tabular-nums ${
                  remaining < 0
                    ? "font-medium text-destructive"
                    : remaining <= 50
                      ? "font-medium text-amber-600"
                      : "text-muted-foreground"
                }`}
                aria-live="polite"
              >
                {remaining < 0
                  ? `${-remaining} over the limit`
                  : `${remaining} left`}
              </span>
              <Button onClick={handlePost} disabled={!canPost}>
                {submitting ? "Posting…" : "Post"}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {builderMounted && (
        <RouteMapBuilder
          open={builderOpen}
          onOpenChange={setBuilderOpen}
          initialValue={mapData}
          onSave={setMapData}
        />
      )}
    </>
  );
}

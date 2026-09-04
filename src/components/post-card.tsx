"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThumbsUp, ThumbsDown, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { mapDataSchema, type MapData } from "@/lib/schemas/post-map";
import { guideMapDataSchema, type GuideMapData } from "@/lib/schemas/guide-map";
import { StaticRouteMap } from "@/components/map/static-route-map";
import { StaticGuideMap } from "@/components/map/static-guide-map";
import { GuideMapBuilder } from "@/components/map/guide-map-builder";
import { MapView, Marker, Popup, Source, Layer } from "@/components/map";
import { lineStringFromPins, fitPinsToView } from "@/components/map/route-geometry";

export type PostCardData = {
  id: string;
  body: string;
  created_at: string;
  net_votes: number;
  /** Unvalidated from DB — always safeParse before use. */
  map_data?: unknown;
  comments: { count: number }[] | null;
  users:
    | { username: string | null; display_name: string | null; avatar_url: string | null }
    | { username: string | null; display_name: string | null; avatar_url: string | null }[]
    | null;
};

type CommentRow = {
  id: string;
  body: string;
  created_at: string;
  /** Unvalidated from DB — always safeParse before rendering. */
  map_data?: unknown;
  users:
    | { username: string | null; display_name: string | null; avatar_url: string | null }
    | { username: string | null; display_name: string | null; avatar_url: string | null }[]
    | null;
};

type Props = {
  post: PostCardData;
  initialUserVote: 1 | -1 | null;
  currentUserId: string | null;
  /** Focus mode: content not clickable, comments expanded on mount. */
  focusMode?: boolean;
};

// ---------------------------------------------------------------------------
// FocusMapView — interactive map rendered only in focus mode (1 WebGL context)
// ---------------------------------------------------------------------------

function FocusMapView({ pins }: { pins: import("@/lib/schemas/post-map").MapPin[] }) {
  const [activePopup, setActivePopup] = useState<number | null>(null);
  const fit = fitPinsToView(pins, 600, 320);
  const lineData = pins.length >= 2 ? lineStringFromPins(pins) : null;

  return (
    <div className="mt-3 w-full">
      <MapView
        className="h-[220px] overflow-hidden rounded-lg sm:h-[320px]"
        interactive
        cooperativeGestures
        showNavigationControl
        initialViewState={fit}
      >
        {lineData && (
          <Source id="focus-route-line" type="geojson" data={lineData}>
            <Layer
              id="focus-route-line-layer"
              type="line"
              paint={{
                "line-color": "#3b82f6",
                "line-width": 3,
                "line-opacity": 0.85,
              }}
              layout={{ "line-join": "round", "line-cap": "round" }}
            />
          </Source>
        )}
        {pins.map((pin, i) => (
          <Marker
            key={i}
            longitude={pin.lng}
            latitude={pin.lat}
            color={i === 0 ? "#22c55e" : i === pins.length - 1 ? "#ef4444" : "#6b7280"}
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              setActivePopup(activePopup === i ? null : i);
            }}
          />
        ))}
        {activePopup !== null && pins[activePopup] && (
          <Popup
            longitude={pins[activePopup].lng}
            latitude={pins[activePopup].lat}
            onClose={() => setActivePopup(null)}
            closeButton={false}
            anchor="bottom"
          >
            <p className="text-xs font-medium max-w-[180px] leading-tight">
              {pins[activePopup].label}
            </p>
            {pins[activePopup].sublabel && (
              <p className="text-[10px] text-muted-foreground max-w-[180px] leading-tight mt-0.5">
                {pins[activePopup].sublabel}
              </p>
            )}
          </Popup>
        )}
      </MapView>
    </div>
  );
}

function formatPostTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export function PostCard({ post, initialUserVote, currentUserId, focusMode = false }: Props) {
  const router = useRouter();
  const raw = post.users;
  const u = Array.isArray(raw) ? raw[0] : raw;

  // Parse map_data defensively — a bad row renders no map instead of crashing the feed
  const mapData: MapData | null = (() => {
    if (!post.map_data) return null;
    const result = mapDataSchema.safeParse(post.map_data);
    return result.success ? result.data : null;
  })();
  const display = u?.display_name ?? "Unknown user";
  const handle = u?.username ?? null;

  const [netVotes, setNetVotes] = useState(post.net_votes);
  const [userVote, setUserVote] = useState<1 | -1 | null>(initialUserVote);
  const [votePending, setVotePending] = useState(false);

  const [showComments, setShowComments] = useState(focusMode);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentCount, setCommentCount] = useState(post.comments?.[0]?.count ?? 0);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentPending, setCommentPending] = useState(false);
  const [commentMapData, setCommentMapData] = useState<GuideMapData | null>(null);
  const [guideBuilderOpen, setGuideBuilderOpen] = useState(false);

  const supabase = createClient();

  // Auto-load comments when in focus mode
  useEffect(() => {
    if (focusMode) {
      loadComments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMode]);

  async function vote(value: 1 | -1) {
    if (!currentUserId) {
      toast.error("Sign in to vote.");
      return;
    }
    if (votePending) return;
    setVotePending(true);

    const isToggleOff = userVote === value;

    // Optimistic update
    const prevVotes = netVotes;
    const prevUserVote = userVote;
    if (isToggleOff) {
      setNetVotes((v) => v - value);
      setUserVote(null);
    } else {
      setNetVotes((v) => v - (userVote ?? 0) + value);
      setUserVote(value);
    }

    try {
      if (isToggleOff) {
        const { error } = await supabase
          .from("post_votes")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", currentUserId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("post_votes")
          .upsert({ post_id: post.id, user_id: currentUserId, value }, { onConflict: "post_id,user_id" });
        if (error) throw error;
      }
    } catch {
      setNetVotes(prevVotes);
      setUserVote(prevUserVote);
      toast.error("Vote failed. Try again.");
    } finally {
      setVotePending(false);
    }
  }

  async function loadComments() {
    if (commentsLoaded) return;
    const { data, error } = await supabase
      .from("comments")
      .select("id, body, created_at, map_data, users(username, display_name, avatar_url)")
      .eq("post_id", post.id)
      .order("created_at", { ascending: true });
    if (error) {
      toast.error("Couldn't load comments.");
      return;
    }
    setComments((data ?? []) as CommentRow[]);
    setCommentsLoaded(true);
  }

  function toggleComments() {
    const next = !showComments;
    setShowComments(next);
    if (next) loadComments();
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    const body = commentBody.trim();
    if (!body || !currentUserId) return;
    setCommentPending(true);
    const insertPayload: Record<string, unknown> = { post_id: post.id, author_id: currentUserId, body };
    if (commentMapData) insertPayload.map_data = commentMapData;
    const { data, error } = await supabase
      .from("comments")
      .insert(insertPayload)
      .select("id, body, created_at, map_data, users(username, display_name, avatar_url)")
      .single();
    if (error) {
      toast.error("Comment failed.");
    } else {
      setComments((prev) => [...prev, data as CommentRow]);
      setCommentCount((c) => c + 1);
      setCommentBody("");
      setCommentMapData(null);
    }
    setCommentPending(false);
  }

  async function share() {
    const url = `${window.location.origin}/p/${post.id}`;
    if (typeof navigator.share !== "undefined") {
      try {
        await navigator.share({ url, text: post.body.slice(0, 100) });
        return;
      } catch {
        // User cancelled or not supported — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied.");
    } catch {
      toast.error("Couldn't copy link.");
    }
  }

  const authorNode = (
    <span className="min-w-0">
      <span className="font-medium">{display}</span>
      {handle && <span className="ml-1 text-muted-foreground">@{handle}</span>}
    </span>
  );

  // Header + body — clickable in feed mode, plain in focus mode
  const contentRegion = (
    <div
      onClick={!focusMode ? () => router.push(`/p/${post.id}`) : undefined}
      className={cn(!focusMode && "cursor-pointer")}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <UserAvatar src={u?.avatar_url ?? null} name={display} className="h-8 w-8 shrink-0" />
          <p className="min-w-0 truncate text-sm">
            {handle ? (
              <Link
                href={`/u/${handle}`}
                className="hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {authorNode}
              </Link>
            ) : (
              authorNode
            )}
          </p>
        </div>
        <p className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
          {formatPostTime(post.created_at)}
        </p>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm">{post.body}</p>

      {/* Map — static preview in feed, interactive in focus view */}
      {mapData && !focusMode && (
        <div className="mt-3 w-full">
          <StaticRouteMap pins={mapData.pins} width={560} height={240} />
        </div>
      )}
      {mapData && focusMode && (
        <FocusMapView pins={mapData.pins} />
      )}
    </div>
  );

  return (
    <li className="min-w-0 rounded-xl border bg-card p-3 shadow-sm sm:p-4">
      {contentRegion}

      {/* Action bar — outside click region, so no stopPropagation needed */}
      <div className="mt-3 flex items-center gap-2 text-muted-foreground sm:gap-4">
        {/* Votes: [up] count [down] */}
        <div className="flex items-center">
          <button
            onClick={() => vote(1)}
            disabled={votePending}
            className={cn(
              "flex min-h-11 min-w-11 items-center justify-center text-xs transition-colors hover:text-foreground",
              userVote === 1 && "text-green-500"
            )}
          >
            <ThumbsUp className="h-4 w-4" />
          </button>
          <span className={cn(
            "min-w-[1.5rem] text-center text-xs tabular-nums",
            netVotes > 0 && "text-green-500",
            netVotes < 0 && "text-red-500",
          )}>
            {netVotes}
          </span>
          <button
            onClick={() => vote(-1)}
            disabled={votePending}
            className={cn(
              "flex min-h-11 min-w-11 items-center justify-center text-xs transition-colors hover:text-foreground",
              userVote === -1 && "text-red-500"
            )}
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </div>

        {/* Comments */}
        <button
          onClick={toggleComments}
          className="flex min-h-11 items-center gap-1 px-2 text-xs transition-colors hover:text-foreground"
        >
          <MessageCircle className="h-4 w-4" />
          <span>{commentCount > 0 ? commentCount : ""}</span>
        </button>

        {/* Share */}
        <button
          onClick={share}
          className="flex min-h-11 min-w-11 items-center justify-center text-xs transition-colors hover:text-foreground"
        >
          <Share2 className="h-4 w-4" />
        </button>
      </div>

      {/* Comment section */}
      {showComments && (
        <div className="mt-3 border-t pt-3 space-y-3">
          {comments.length === 0 && commentsLoaded && (
            <p className="text-xs text-muted-foreground">No comments yet.</p>
          )}
          {comments.map((c) => {
            const cu = Array.isArray(c.users) ? c.users[0] : c.users;
            const cDisplay = cu?.display_name ?? "Unknown";
            const cHandle = cu?.username ?? null;
            return (
              <div key={c.id} className="flex gap-2">
                <UserAvatar src={cu?.avatar_url ?? null} name={cDisplay} className="h-6 w-6 shrink-0 mt-0.5" />
                <div className="text-xs flex-1 min-w-0">
                  {cHandle ? (
                    <Link href={`/u/${cHandle}`} className="font-medium hover:underline mr-1">
                      {cDisplay}
                    </Link>
                  ) : (
                    <span className="font-medium mr-1">{cDisplay}</span>
                  )}
                  <span className="text-muted-foreground whitespace-pre-wrap">{c.body}</span>
                  {/* Guide map attached to comment */}
                  {(() => {
                    if (!c.map_data) return null;
                    const parsed = guideMapDataSchema.safeParse(c.map_data);
                    if (!parsed.success) return null;
                    return (
                      <div className="mt-2 w-full">
                        <StaticGuideMap data={parsed.data} width={480} height={200} />
                      </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}

          {currentUserId && (
            <div className="space-y-1.5">
              {/* Map chip when a guide map is attached */}
              {commentMapData && (
                <div className="flex items-center gap-2 text-xs bg-muted/60 rounded-md px-2 py-1.5">
                  <span className="flex-1 truncate">
                    🗺️ Guide route · {commentMapData.legs.length} leg{commentMapData.legs.length !== 1 ? "s" : ""}
                    {commentMapData.connectors.length > 0 && ` · ${commentMapData.connectors.length} transfer${commentMapData.connectors.length !== 1 ? "s" : ""}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setGuideBuilderOpen(true)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommentMapData(null)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    ✕
                  </button>
                </div>
              )}
              <form onSubmit={submitComment} className="flex items-stretch gap-2">
                <input
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  onFocus={(e) =>
                    e.currentTarget.scrollIntoView({ block: "center", behavior: "smooth" })
                  }
                  placeholder="Add a comment…"
                  maxLength={500}
                  disabled={commentPending}
                  className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 md:py-1.5 md:text-xs"
                />
                {!commentMapData && (
                  <button
                    type="button"
                    onClick={() => setGuideBuilderOpen(true)}
                    className="shrink-0 rounded-md border px-3 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                    title="Add guide route map"
                  >
                    🗺️
                  </button>
                )}
                <button
                  type="submit"
                  disabled={commentPending || !commentBody.trim()}
                  className="shrink-0 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  Post
                </button>
              </form>
              <GuideMapBuilder
                open={guideBuilderOpen}
                onOpenChange={setGuideBuilderOpen}
                initialValue={commentMapData}
                onSave={setCommentMapData}
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

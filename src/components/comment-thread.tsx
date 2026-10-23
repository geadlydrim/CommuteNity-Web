"use client";

import { useState, useEffect, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { riderMessage } from "@/lib/errors";
import { UserAvatar } from "@/components/user-avatar";
import { guideMapDataSchema, type GuideMapData } from "@/lib/schemas/guide-map";
import { StaticGuideMap } from "@/components/map/static-guide-map";
import { POST_BODY_MAX } from "@/lib/schemas/post";

// The builder pulls in MapLibre; load it only once a signed-in rider opens it.
const GuideMapBuilder = dynamic(
  () => import("@/components/map/guide-map-builder").then((m) => m.GuideMapBuilder),
  { ssr: false }
);

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
  postId: string;
  initialCommentCount: number;
  currentUserId: string | null;
  /** Focus view: comments expanded and loaded on mount. */
  startOpen: boolean;
  /**
   * The thread owns the card's action bar, so its toggle sits between the
   * other actions and the comments open below the bar.
   */
  actionsBefore?: ReactNode;
  actionsAfter?: ReactNode;
};

export function CommentThread({
  postId,
  initialCommentCount,
  currentUserId,
  startOpen,
  actionsBefore,
  actionsAfter,
}: Props) {
  const [showComments, setShowComments] = useState(startOpen);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentPending, setCommentPending] = useState(false);
  const [commentMapData, setCommentMapData] = useState<GuideMapData | null>(null);
  const [guideBuilderOpen, setGuideBuilderOpen] = useState(false);
  // Stays true after the first open so the builder keeps its close animation.
  const [guideBuilderMounted, setGuideBuilderMounted] = useState(false);

  const supabase = createClient();

  // Auto-load comments when in focus mode
  useEffect(() => {
    if (startOpen) {
      loadComments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startOpen]);

  async function loadComments() {
    if (commentsLoaded) return;
    const { data, error } = await supabase
      .from("comments")
      .select("id, body, created_at, map_data, users(username, display_name, avatar_url)")
      .eq("post_id", postId)
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

  function openGuideBuilder() {
    setGuideBuilderMounted(true);
    setGuideBuilderOpen(true);
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    const body = commentBody.trim();
    if (!body || !currentUserId) return;
    setCommentPending(true);
    const insertPayload: TablesInsert<"comments"> = { post_id: postId, author_id: currentUserId, body };
    if (commentMapData) insertPayload.map_data = commentMapData;
    const { data, error } = await supabase
      .from("comments")
      .insert(insertPayload)
      .select("id, body, created_at, map_data, users(username, display_name, avatar_url)")
      .single();
    if (error) {
      toast.error(riderMessage(error, { fallback: "Comment failed." }));
    } else {
      setComments((prev) => [...prev, data as CommentRow]);
      setCommentCount((c) => c + 1);
      setCommentBody("");
      setCommentMapData(null);
    }
    setCommentPending(false);
  }

  return (
    <>
      {/* Action bar — outside the card link, so no stopPropagation needed */}
      <div className="mt-3 flex items-center gap-2 text-muted-foreground sm:gap-4">
        {actionsBefore}

        {/* Comments */}
        <button
          onClick={toggleComments}
          className="flex min-h-11 items-center gap-1 px-2 text-xs transition-colors hover:text-foreground"
        >
          <MessageCircle className="h-4 w-4" />
          <span>{commentCount > 0 ? commentCount : ""}</span>
        </button>

        {actionsAfter}
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
                    onClick={openGuideBuilder}
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
                  maxLength={POST_BODY_MAX}
                  disabled={commentPending}
                  className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 md:py-1.5 md:text-xs"
                />
                {!commentMapData && (
                  <button
                    type="button"
                    onClick={openGuideBuilder}
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
              {guideBuilderMounted && (
                <GuideMapBuilder
                  open={guideBuilderOpen}
                  onOpenChange={setGuideBuilderOpen}
                  initialValue={commentMapData}
                  onSave={setCommentMapData}
                />
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

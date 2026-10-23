"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { riderMessage } from "@/lib/errors";
import { UserAvatar } from "@/components/user-avatar";
import { GuidePreview } from "@/components/map";
import type { GuideMapData } from "@/lib/schemas/guide-map";
import { POST_BODY_MAX } from "@/lib/schemas/post";
import {
  addComment,
  listComments,
  mergeComments,
  type Comment,
  type CommentCursor,
} from "@/lib/posts/comments";

// The builder pulls in MapLibre; load it only once a signed-in rider opens it.
const GuideMapBuilder = dynamic(
  () => import("@/components/map/guide-map-builder").then((m) => m.GuideMapBuilder),
  { ssr: false }
);

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
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [serverCount, setServerCount] = useState(initialCommentCount);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [nextCursor, setNextCursor] = useState<CommentCursor | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentPending, setCommentPending] = useState(false);
  const [commentMapData, setCommentMapData] = useState<GuideMapData | null>(null);
  const [guideBuilderOpen, setGuideBuilderOpen] = useState(false);
  // Stays true after the first open so the builder keeps its close animation.
  const [guideBuilderMounted, setGuideBuilderMounted] = useState(false);
  // One page request at a time: double clicks and StrictMode's double effect send one.
  const loadInFlight = useRef(false);

  // Adopt the server's count when a refresh brings a new one.
  if (serverCount !== initialCommentCount) {
    setServerCount(initialCommentCount);
    setCommentCount(initialCommentCount);
  }

  const supabase = createClient();

  // Auto-load comments when in focus mode
  useEffect(() => {
    if (startOpen) {
      loadComments(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startOpen]);

  /** Loads the page after `after`, or the first page when it's null. */
  async function loadComments(after: CommentCursor | null) {
    if (loadInFlight.current) return;
    loadInFlight.current = true;
    setCommentsLoading(true);
    setLoadError(null);
    const result = await listComments(supabase, { postId, after });
    loadInFlight.current = false;
    setCommentsLoading(false);
    if (!result.ok) {
      setLoadError(riderMessage(result.error, { fallback: "Couldn't load comments." }));
      return;
    }
    setComments((prev) => mergeComments(prev, result.comments));
    setNextCursor(result.nextCursor);
    setCommentsLoaded(true);
  }

  function retryLoad() {
    loadComments(commentsLoaded ? nextCursor : null);
  }

  function toggleComments() {
    const next = !showComments;
    setShowComments(next);
    if (next && !commentsLoaded) loadComments(null);
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
    const result = await addComment(supabase, {
      postId,
      authorId: currentUserId,
      body,
      mapData: commentMapData,
    });
    if (!result.ok) {
      toast.error(riderMessage(result.error, { fallback: "Comment failed." }));
    } else {
      setComments((prev) => mergeComments(prev, [result.comment]));
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
          {comments.map((comment) => {
            const author = comment.author;
            const authorName = author?.display_name ?? "Unknown";
            const authorUsername = author?.username ?? null;
            return (
              <div key={comment.id} className="flex gap-2">
                <UserAvatar src={author?.avatar_url ?? null} name={authorName} className="h-6 w-6 shrink-0 mt-0.5" />
                <div className="text-xs flex-1 min-w-0">
                  {authorUsername ? (
                    <Link href={`/u/${authorUsername}`} className="font-medium hover:underline mr-1">
                      {authorName}
                    </Link>
                  ) : (
                    <span className="font-medium mr-1">{authorName}</span>
                  )}
                  <span className="text-muted-foreground whitespace-pre-wrap">{comment.body}</span>
                  {/* Guide attached to the comment */}
                  {comment.map_data != null && (
                    <div className="mt-2 w-full">
                      <GuidePreview mapData={comment.map_data} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {loadError ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-destructive">{loadError}</span>
              <button
                type="button"
                onClick={retryLoad}
                disabled={commentsLoading}
                className="min-h-11 px-2 font-medium text-foreground hover:underline disabled:opacity-50"
              >
                Retry
              </button>
            </div>
          ) : (
            nextCursor && (
              <button
                type="button"
                onClick={() => loadComments(nextCursor)}
                disabled={commentsLoading}
                className="min-h-11 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                {commentsLoading ? "Loading…" : "Show more comments"}
              </button>
            )
          )}

          {currentUserId && (
            <div className="space-y-1.5">
              {/* Map chip when a guide is attached */}
              {commentMapData && (
                <div className="flex items-center gap-2 text-xs bg-muted/60 rounded-md px-2 py-1.5">
                  <span className="flex-1 truncate">
                    🗺️ Guide · {commentMapData.legs.length} leg{commentMapData.legs.length !== 1 ? "s" : ""}
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
                    title="Add guide"
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

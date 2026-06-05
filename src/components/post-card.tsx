"use client";

import { useState } from "react";
import Link from "next/link";
import { ThumbsUp, ThumbsDown, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

export type PostCardData = {
  id: string;
  body: string;
  created_at: string;
  net_votes: number;
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
  users:
    | { username: string | null; display_name: string | null; avatar_url: string | null }
    | { username: string | null; display_name: string | null; avatar_url: string | null }[]
    | null;
};

type Props = {
  post: PostCardData;
  initialUserVote: 1 | -1 | null;
  currentUserId: string | null;
};

export function PostCard({ post, initialUserVote, currentUserId }: Props) {
  const raw = post.users;
  const u = Array.isArray(raw) ? raw[0] : raw;
  const display = u?.display_name ?? "Unknown user";
  const handle = u?.username ?? null;

  const [netVotes, setNetVotes] = useState(post.net_votes);
  const [userVote, setUserVote] = useState<1 | -1 | null>(initialUserVote);
  const [votePending, setVotePending] = useState(false);

  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentCount, setCommentCount] = useState(post.comments?.[0]?.count ?? 0);
  const [commentsLoaded, setCommentsLoaded] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentPending, setCommentPending] = useState(false);

  const supabase = createClient();

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
      // Rollback
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
      .select("id, body, created_at, users(username, display_name, avatar_url)")
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
    const { data, error } = await supabase
      .from("comments")
      .insert({ post_id: post.id, author_id: currentUserId, body })
      .select("id, body, created_at, users(username, display_name, avatar_url)")
      .single();
    if (error) {
      toast.error("Comment failed.");
    } else {
      setComments((prev) => [...prev, data as CommentRow]);
      setCommentCount((c) => c + 1);
      setCommentBody("");
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
    <span>
      <span className="font-medium">{display}</span>
      {handle && <span className="ml-1 text-muted-foreground">@{handle}</span>}
    </span>
  );

  return (
    <li className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <UserAvatar src={u?.avatar_url ?? null} name={display} className="h-8 w-8" />
          <p className="text-sm">
            {handle ? (
              <Link href={`/u/${handle}`} className="hover:underline">
                {authorNode}
              </Link>
            ) : (
              authorNode
            )}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {new Date(post.created_at).toLocaleString()}
        </p>
      </div>

      <p className="mt-2 whitespace-pre-wrap text-sm">{post.body}</p>

      {/* Action bar */}
      <div className="mt-3 flex items-center gap-4 text-muted-foreground">
        {/* Upvote */}
        <button
          onClick={() => vote(1)}
          disabled={votePending}
          className={cn(
            "flex items-center gap-1 text-xs hover:text-foreground transition-colors",
            userVote === 1 && "text-green-500"
          )}
        >
          <ThumbsUp className="h-4 w-4" />
          <span>{netVotes > 0 ? netVotes : netVotes === 0 ? "" : netVotes}</span>
        </button>

        {/* Downvote */}
        <button
          onClick={() => vote(-1)}
          disabled={votePending}
          className={cn(
            "flex items-center gap-1 text-xs hover:text-foreground transition-colors",
            userVote === -1 && "text-red-500"
          )}
        >
          <ThumbsDown className="h-4 w-4" />
          {netVotes < 0 && <span>{netVotes}</span>}
        </button>

        {/* Comments */}
        <button
          onClick={toggleComments}
          className="flex items-center gap-1 text-xs hover:text-foreground transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          <span>{commentCount > 0 ? commentCount : ""}</span>
        </button>

        {/* Share */}
        <button
          onClick={share}
          className="flex items-center gap-1 text-xs hover:text-foreground transition-colors"
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
                <div className="text-xs">
                  {cHandle ? (
                    <Link href={`/u/${cHandle}`} className="font-medium hover:underline mr-1">
                      {cDisplay}
                    </Link>
                  ) : (
                    <span className="font-medium mr-1">{cDisplay}</span>
                  )}
                  <span className="text-muted-foreground whitespace-pre-wrap">{c.body}</span>
                </div>
              </div>
            );
          })}

          {currentUserId && (
            <form onSubmit={submitComment} className="flex gap-2">
              <input
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Add a comment…"
                maxLength={500}
                disabled={commentPending}
                className="flex-1 rounded-md border bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={commentPending || !commentBody.trim()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Post
              </button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}

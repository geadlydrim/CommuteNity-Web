"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { riderMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { ViewerVote } from "@/lib/posts";

type Props = {
  postId: string;
  initialNetVotes: number;
  initialUserVote: ViewerVote;
  currentUserId: string | null;
};

export function PostVoteControls({ postId, initialNetVotes, initialUserVote, currentUserId }: Props) {
  const [netVotes, setNetVotes] = useState(initialNetVotes);
  const [userVote, setUserVote] = useState<ViewerVote>(initialUserVote);
  const [votePending, setVotePending] = useState(false);

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
          .eq("post_id", postId)
          .eq("user_id", currentUserId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("post_votes")
          .upsert({ post_id: postId, user_id: currentUserId, value }, { onConflict: "post_id,user_id" });
        if (error) throw error;
      }
    } catch (error) {
      setNetVotes(prevVotes);
      setUserVote(prevUserVote);
      toast.error(riderMessage(error, { fallback: "Vote failed. Try again." }));
    } finally {
      setVotePending(false);
    }
  }

  // Votes: [up] count [down]
  return (
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
  );
}

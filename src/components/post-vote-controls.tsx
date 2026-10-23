"use client";

import { useRef, useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { riderMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import type { ViewerVote } from "@/lib/posts";
import { nextVote, setVote } from "@/lib/posts/votes";

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
  const [serverProps, setServerProps] = useState({ initialNetVotes, initialUserVote });
  // Latest click; results from superseded clicks are ignored.
  const seq = useRef(0);

  // Adopt fresh server props (router.refresh) unless a write is in flight.
  if (
    !votePending &&
    (serverProps.initialNetVotes !== initialNetVotes || serverProps.initialUserVote !== initialUserVote)
  ) {
    setServerProps({ initialNetVotes, initialUserVote });
    setNetVotes(initialNetVotes);
    setUserVote(initialUserVote);
  }

  const supabase = createClient();

  // Writes are blocked while one is in flight, so the final state is always the last accepted click.
  async function vote(pressed: 1 | -1) {
    if (!currentUserId) {
      toast.error("Sign in to vote.");
      return;
    }
    if (votePending) return;
    setVotePending(true);
    const mySeq = ++seq.current;

    const prev = { total: netVotes, vote: userVote };
    const next = nextVote({ total: netVotes, current: userVote, pressed });
    setNetVotes(next.total);
    setUserVote(next.vote);

    const result = await setVote(supabase, { postId, riderId: currentUserId, vote: next.vote });
    if (mySeq !== seq.current) return;
    if (result.ok) {
      setNetVotes(result.total);
    } else {
      setNetVotes(prev.total);
      setUserVote(prev.vote);
      toast.error(riderMessage(result.error, { fallback: "Vote failed. Try again." }));
    }
    setVotePending(false);
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

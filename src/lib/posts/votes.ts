import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { ViewerVote } from "./types";

export type VoteDirection = 1 | -1;

/**
 * Pure vote transition: pressing the current direction clears the vote,
 * pressing the other direction switches it, pressing from none adds it.
 */
export function nextVote({
  total,
  current,
  pressed,
}: {
  total: number;
  current: ViewerVote;
  pressed: VoteDirection;
}): { total: number; vote: ViewerVote } {
  if (current === pressed) return { total: total - pressed, vote: null };
  return { total: total - (current ?? 0) + pressed, vote: pressed };
}

export type SetVoteResult = { ok: true; total: number } | { ok: false; error: unknown };

/** Sets (or clears, when `vote` is null) a rider's vote, then reads the server total. */
export async function setVote(
  supabase: SupabaseClient<Database>,
  { postId, riderId, vote }: { postId: string; riderId: string; vote: ViewerVote },
): Promise<SetVoteResult> {
  const write =
    vote === null
      ? await supabase.from("post_votes").delete().eq("post_id", postId).eq("user_id", riderId)
      : await supabase
          .from("post_votes")
          .upsert({ post_id: postId, user_id: riderId, value: vote }, { onConflict: "post_id,user_id" });
  if (write.error) return { ok: false, error: write.error };

  const { data, error } = await supabase.from("posts").select("net_votes").eq("id", postId).single();
  if (error) return { ok: false, error };
  return { ok: true, total: data.net_votes };
}

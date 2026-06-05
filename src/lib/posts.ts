import { createClient } from "@/lib/supabase/server";
import type { PostCardData } from "@/components/post-card";

export type PostByIdResult = {
  post: PostCardData | null;
  initialUserVote: 1 | -1 | null;
  currentUserId: string | null;
};

export async function getPostById(id: string): Promise<PostByIdResult> {
  const supabase = await createClient();

  const [{ data: post }, { data: { user } }] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, body, created_at, net_votes, users(username, display_name, avatar_url), comments(count)"
      )
      .eq("id", id)
      .eq("visibility", "public")
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  const currentUserId = user?.id ?? null;

  if (!post) {
    return { post: null, initialUserVote: null, currentUserId };
  }

  let initialUserVote: 1 | -1 | null = null;
  if (user) {
    const { data: vote } = await supabase
      .from("post_votes")
      .select("value")
      .eq("user_id", user.id)
      .eq("post_id", id)
      .maybeSingle();
    if (vote) initialUserVote = vote.value as 1 | -1;
  }

  return { post: post as PostCardData, initialUserVote, currentUserId };
}

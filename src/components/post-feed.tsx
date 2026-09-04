import { createClient } from "@/lib/supabase/server";
import { PostCard, type PostCardData } from "@/components/post-card";

export async function PostFeed() {
  const supabase = await createClient();

  const [
    { data, error },
    { data: { user } },
  ] = await Promise.all([
    supabase
      .from("posts")
      .select("id, body, created_at, net_votes, map_data, users(username, display_name, avatar_url), comments(count)")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.auth.getUser(),
  ]);

  if (error) {
    console.error("[Feed] fetch failed:", error);
    return <p className="text-sm text-muted-foreground">Couldn&apos;t load feed.</p>;
  }
  if (!data?.length) {
    return <p className="text-sm text-muted-foreground">No posts yet.</p>;
  }

  // Fetch current user's votes for all posts
  const userVotes: Record<string, 1 | -1> = {};
  if (user && data.length) {
    const postIds = data.map((p) => p.id);
    const { data: votes } = await supabase
      .from("post_votes")
      .select("post_id, value")
      .eq("user_id", user.id)
      .in("post_id", postIds);
    votes?.forEach((v) => {
      userVotes[v.post_id] = v.value as 1 | -1;
    });
  }

  return (
    <ul className="w-full space-y-3">
      {(data as PostCardData[]).map((p) => (
        <PostCard
          key={p.id}
          post={p}
          initialUserVote={userVotes[p.id] ?? null}
          currentUserId={user?.id ?? null}
        />
      ))}
    </ul>
  );
}

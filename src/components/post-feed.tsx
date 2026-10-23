import { createClient } from "@/lib/supabase/server";
import { listFeedPosts } from "@/lib/posts";
import { PostCard } from "@/components/post-card";

export async function PostFeed() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const viewerId = user?.id ?? null;

  const { posts, error } = await listFeedPosts(supabase, viewerId);

  if (error) {
    console.error("[Feed] fetch failed:", error);
    return <p className="text-sm text-muted-foreground">Couldn&apos;t load feed.</p>;
  }
  if (!posts.length) {
    return <p className="text-sm text-muted-foreground">No posts yet.</p>;
  }

  return (
    <ul className="w-full space-y-3">
      {posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          initialUserVote={p.viewerVote}
          currentUserId={viewerId}
        />
      ))}
    </ul>
  );
}

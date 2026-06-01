import { createClient } from "@/lib/supabase/server";
import { PostCard, type PostCardData } from "@/components/post-card";

export async function PostFeed() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select("id, body, created_at, users(username, display_name, avatar_url)")
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[Feed] fetch failed:", error);
    return <p className="text-sm text-muted-foreground">Couldn&apos;t load feed.</p>;
  }
  if (!data?.length) {
    return <p className="text-sm text-muted-foreground">No posts yet.</p>;
  }

  return (
    <ul className="w-[40vw] space-y-3">
      {(data as PostCardData[]).map((p) => (
        <PostCard key={p.id} post={p} />
      ))}
    </ul>
  );
}

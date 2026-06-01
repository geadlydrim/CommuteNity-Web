import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PostCard, type PostCardData } from "@/components/post-card";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const handle = username.toLowerCase();

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("users")
    .select("id, username, display_name")
    .eq("username", handle)
    .maybeSingle();

  if (!profile) notFound();

  const { data: posts, error } = await supabase
    .from("posts")
    .select("id, body, created_at, users(username, display_name)")
    .eq("user_id", profile.id)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[Profile] posts fetch failed:", error);
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-8 pt-12 pb-16 gap-6">
      <header className="w-[40vw]">
        <h1 className="text-2xl font-bold">{profile.display_name ?? "Unknown user"}</h1>
        <p className="text-muted-foreground">@{profile.username}</p>
      </header>
      {posts && posts.length > 0 ? (
        <ul className="w-[40vw] space-y-3">
          {(posts as PostCardData[]).map((p) => (
            <PostCard key={p.id} post={p} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No posts yet.</p>
      )}
    </main>
  );
}

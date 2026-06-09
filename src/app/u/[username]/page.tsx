import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PostCard, type PostCardData } from "@/components/post-card";
import { ProfileEditDialog } from "@/components/profile-edit-dialog";
import { UserAvatar } from "@/components/user-avatar";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const handle = username.toLowerCase();

  const supabase = await createClient();

  const [{ data: profile }, { data: { user: viewer } }] = await Promise.all([
    supabase
      .from("users")
      .select("id, username, display_name, avatar_url, username_changed_at")
      .eq("username", handle)
      .maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (!profile) notFound();

  const isSelf = viewer?.id === profile.id;

  const { data: posts, error: postsError } = await supabase
    .from("posts")
    .select("id, body, created_at, net_votes, map_data, users(username, display_name, avatar_url), comments(count)")
    .eq("user_id", profile.id)
    .eq("visibility", "public")
    .order("created_at", { ascending: false })
    .limit(50);

  if (postsError) {
    console.error("[Profile] posts fetch failed:", postsError);
  }

  const userVotes: Record<string, 1 | -1> = {};
  if (viewer && posts?.length) {
    const postIds = posts.map((p) => p.id);
    const { data: votes } = await supabase
      .from("post_votes")
      .select("post_id, value")
      .eq("user_id", viewer.id)
      .in("post_id", postIds);
    votes?.forEach((v) => {
      userVotes[v.post_id] = v.value as 1 | -1;
    });
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-8 pt-12 pb-16 gap-6">
      <header className="w-[40vw]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <UserAvatar
              src={profile.avatar_url ?? null}
              name={profile.display_name ?? profile.username}
              className="h-16 w-16"
            />
            <div>
              <h1 className="text-2xl font-bold">
                {profile.display_name ?? "Unknown user"}
              </h1>
              <p className="text-muted-foreground">@{profile.username}</p>
            </div>
          </div>
          {isSelf && (
            <ProfileEditDialog
              userId={profile.id}
              currentUsername={profile.username ?? ""}
              currentDisplayName={profile.display_name ?? ""}
              currentAvatarUrl={profile.avatar_url ?? null}
              usernameChangedAt={profile.username_changed_at ?? null}
            />
          )}
        </div>
      </header>
      {posts && posts.length > 0 ? (
        <ul className="w-[40vw] space-y-3">
          {(posts as PostCardData[]).map((p) => (
            <PostCard
              key={p.id}
              post={p}
              initialUserVote={userVotes[p.id] ?? null}
              currentUserId={viewer?.id ?? null}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No posts yet.</p>
      )}
    </main>
  );
}

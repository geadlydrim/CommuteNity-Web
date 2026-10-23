import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listPostsByAuthor } from "@/lib/posts";
import { PostCard } from "@/components/post-card";
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

  const viewerId = viewer?.id ?? null;
  const isSelf = viewerId === profile.id;

  const { posts, error: postsError } = await listPostsByAuthor(
    supabase,
    profile,
    viewerId,
  );

  if (postsError) {
    console.error("[Profile] posts fetch failed:", postsError);
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 pt-8 pb-12 lg:pt-12 lg:pb-16">
      <header className="feed-col">
        <Link
          href="/"
          className="mb-6 inline-block text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          ← Back to feed
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <UserAvatar
              src={profile.avatar_url ?? null}
              name={profile.display_name ?? profile.username}
              className="h-12 w-12 shrink-0 sm:h-16 sm:w-16"
            />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold sm:text-2xl">
                {profile.display_name ?? "Unknown user"}
              </h1>
              <p className="truncate text-muted-foreground">@{profile.username}</p>
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
        <ul className="feed-col space-y-3">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              initialUserVote={p.viewerVote}
              currentUserId={viewerId}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No posts yet.</p>
      )}
    </main>
  );
}

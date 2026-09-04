import { notFound } from "next/navigation";
import Link from "next/link";
import { getPostById } from "@/lib/posts";
import { PostCard } from "@/components/post-card";

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { post, initialUserVote, currentUserId } = await getPostById(id);

  if (!post) notFound();

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 pt-8 pb-12 lg:pt-12 lg:pb-16">
      <div className="feed-col flex items-center">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to feed
        </Link>
      </div>
      <ul className="feed-col">
        <PostCard
          post={post}
          initialUserVote={initialUserVote}
          currentUserId={currentUserId}
          focusMode
        />
      </ul>
    </main>
  );
}

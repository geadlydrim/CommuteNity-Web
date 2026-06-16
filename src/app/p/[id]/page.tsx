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
    <main className="min-h-screen flex flex-col items-center px-8 pt-12 pb-16 gap-6">
      <div className="w-full max-w-[--content-sm] flex items-center">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to feed
        </Link>
      </div>
      <ul className="w-full max-w-[--content-sm]">
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

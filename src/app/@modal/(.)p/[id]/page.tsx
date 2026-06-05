import { getPostById } from "@/lib/posts";
import { PostModal } from "@/components/post-modal";

export default async function InterceptedPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { post, initialUserVote, currentUserId } = await getPostById(id);

  // Post not found or not public — render nothing (modal simply won't appear)
  if (!post) return null;

  return (
    <PostModal
      post={post}
      initialUserVote={initialUserVote}
      currentUserId={currentUserId}
    />
  );
}

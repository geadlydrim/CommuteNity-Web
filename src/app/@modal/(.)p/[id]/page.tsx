import { createClient } from "@/lib/supabase/server";
import { getPostById } from "@/lib/posts";
import { PostModal } from "@/components/post-modal";
import { FocusView } from "@/components/focus-view";

export default async function InterceptedPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const currentUserId = user?.id ?? null;
  const post = await getPostById(supabase, id, currentUserId);

  // Post not found or not public — render nothing (modal simply won't appear)
  if (!post) return null;

  return (
    <PostModal>
      <FocusView post={post} currentUserId={currentUserId} />
    </PostModal>
  );
}

import { PostCard } from "@/components/post-card";
import { LazyFocusPostMap } from "@/components/lazy-focus-post-map";
import { cn } from "@/lib/utils";
import type { Post } from "@/lib/posts";

type Props = {
  post: Post;
  currentUserId: string | null;
  className?: string;
};

/**
 * One post in focus: comments open and the interactive post map. Rendered by
 * both the permalink `/p/[id]` and the intercepted modal route.
 */
export function FocusView({ post, currentUserId, className }: Props) {
  return (
    // PostCard renders an <li>
    <ul className={cn(className)}>
      <PostCard
        post={post}
        initialUserVote={post.viewerVote}
        currentUserId={currentUserId}
        focus={{ renderMap: (pins) => <LazyFocusPostMap pins={pins} /> }}
      />
    </ul>
  );
}

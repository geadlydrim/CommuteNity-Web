import type { ReactNode } from "react";
import Link from "next/link";
import { UserAvatar } from "@/components/user-avatar";
import { PostVoteControls } from "@/components/post-vote-controls";
import { CommentThread } from "@/components/comment-thread";
import { ShareButton } from "@/components/share-button";
import { mapDataSchema, type MapData, type MapPin } from "@/lib/schemas/post-map";
import { StaticRouteMap } from "@/components/map/static-route-map";
import { formatPostTime } from "@/lib/format-time";
import type { Post, ViewerVote } from "@/lib/posts";

type Props = {
  post: Post;
  initialUserVote: ViewerVote;
  currentUserId: string | null;
  /**
   * Focus view only: the card is not a link, comments open on mount, and the
   * post map comes from `renderMap` instead of the static thumbnail. Feed cards
   * omit it, so they never reference the interactive map.
   */
  focus?: { renderMap: (pins: MapPin[]) => ReactNode };
};

/**
 * Server-rendered post card: author, timestamp, body, and post map. Votes,
 * the comment thread, and share are client islands.
 */
export function PostCard({ post, initialUserVote, currentUserId, focus }: Props) {
  const u = post.author;

  // Parse map_data defensively — a bad row renders no map instead of crashing the feed
  const mapData: MapData | null = (() => {
    if (!post.map_data) return null;
    const result = mapDataSchema.safeParse(post.map_data);
    return result.success ? result.data : null;
  })();
  const display = u?.display_name ?? "Unknown user";
  const handle = u?.username ?? null;

  const authorNode = (
    <span className="min-w-0">
      <span className="font-medium">{display}</span>
      {handle && <span className="ml-1 text-muted-foreground">@{handle}</span>}
    </span>
  );

  return (
    <li className="min-w-0 rounded-xl border bg-card p-3 shadow-sm sm:p-4">
      {/* Header + body — one link to the post in the feed, plain in focus mode.
          The link is an overlay sibling, so the author link and the map's
          attribution link sit above it instead of nesting inside it. */}
      <div className="relative">
        {!focus && (
          <Link href={`/p/${post.id}`} className="absolute inset-0 rounded-lg">
            <span className="sr-only">Open post</span>
          </Link>
        )}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <UserAvatar src={u?.avatar_url ?? null} name={display} className="h-8 w-8 shrink-0" />
            <p className="min-w-0 truncate text-sm">
              {handle ? (
                <Link href={`/u/${handle}`} className="relative z-10 hover:underline">
                  {authorNode}
                </Link>
              ) : (
                authorNode
              )}
            </p>
          </div>
          <p className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
            <time dateTime={post.created_at}>{formatPostTime(post.created_at, new Date())}</time>
          </p>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-sm">{post.body}</p>

        {/* Map — static preview in feed, interactive in focus view.
            The thumbnail lets clicks through to the card link; only its
            attribution link takes pointer events. */}
        {mapData && !focus && (
          <div className="pointer-events-none relative z-10 mt-3 w-full">
            <StaticRouteMap pins={mapData.pins} width={560} height={240} />
          </div>
        )}
        {mapData && focus?.renderMap(mapData.pins)}
      </div>

      <CommentThread
        postId={post.id}
        initialCommentCount={post.commentCount}
        currentUserId={currentUserId}
        startOpen={focus !== undefined}
        actionsBefore={
          <PostVoteControls
            postId={post.id}
            initialNetVotes={post.net_votes}
            initialUserVote={initialUserVote}
            currentUserId={currentUserId}
          />
        }
        actionsAfter={<ShareButton postId={post.id} text={post.body.slice(0, 100)} />}
      />
    </li>
  );
}

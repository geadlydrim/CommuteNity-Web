import type { PostgrestError } from "@supabase/supabase-js";
import type { Tables } from "@/lib/supabase/database.types";

type PostColumns = Pick<
  Tables<"posts">,
  "id" | "body" | "created_at" | "net_votes" | "map_data"
>;

export type PostAuthor = Pick<
  Tables<"users">,
  "username" | "display_name" | "avatar_url"
>;

export type ViewerVote = 1 | -1 | null;

/** A post as the UI consumes it. `map_data` is unvalidated: safeParse before use. */
export type Post = PostColumns & {
  author: PostAuthor | null;
  commentCount: number;
  viewerVote: ViewerVote;
};

/**
 * A row as PostgREST returns it for one of the selections in `./select`.
 * PostgREST may return a to-one embed as an object or a one-element array;
 * `toPost` is the only place that deals with it.
 */
export type PostRow = PostColumns & {
  comments: readonly { count: number }[] | null;
  users?: PostAuthor | PostAuthor[] | null;
  post_votes?: readonly { value: number }[];
};

export type PostList =
  | { posts: Post[]; error: null }
  | { posts: null; error: PostgrestError };

/**
 * Normalize a row into a `Post`. Pass `author` when the caller already has it
 * and the row was selected without the author embed.
 */
export function toPost(row: PostRow, author?: PostAuthor): Post {
  const embedded = Array.isArray(row.users) ? row.users[0] : row.users;
  const vote = row.post_votes?.[0]?.value;
  return {
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    net_votes: row.net_votes,
    map_data: row.map_data,
    author: author ?? embedded ?? null,
    commentCount: row.comments?.[0]?.count ?? 0,
    viewerVote: vote === 1 || vote === -1 ? vote : null,
  };
}

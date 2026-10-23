/**
 * Comment reads and writes. Each takes the caller's Supabase client; RLS is
 * the authority on who may write (ADR 0002).
 *
 * Threads are read a page at a time, oldest first, with a keyset cursor on
 * (created_at, id) so a page boundary between two comments with the same
 * timestamp neither skips nor repeats a comment.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables, TablesInsert } from "@/lib/supabase/database.types";
import type { PostAuthor } from "./types";

type Client = SupabaseClient<Database>;

const COMMENT_PAGE_SIZE = 50;

const COMMENT_SELECT =
  "id, body, created_at, map_data, users(username, display_name, avatar_url)" as const;

type CommentColumns = Pick<Tables<"comments">, "id" | "body" | "created_at" | "map_data">;

/** A comment as the UI consumes it. `map_data` is unvalidated: safeParse before use. */
export type Comment = CommentColumns & { author: PostAuthor | null };

/** Where the next page starts: the last comment already loaded. */
export type CommentCursor = { createdAt: string; id: string };

export type CommentPage =
  | { ok: true; comments: Comment[]; hasMore: boolean; nextCursor: CommentCursor | null }
  | { ok: false; error: unknown };

export type AddCommentResult = { ok: true; comment: Comment } | { ok: false; error: unknown };

/** PostgREST may return the to-one author embed as an object or a one-element array. */
type CommentRow = CommentColumns & { users: PostAuthor | PostAuthor[] | null };

function toComment(row: CommentRow): Comment {
  const author = Array.isArray(row.users) ? row.users[0] : row.users;
  return {
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    map_data: row.map_data,
    author: author ?? null,
  };
}

/** One page of a post's comments, oldest first. Pass `after` for the pages after the first. */
export async function listComments(
  supabase: Client,
  {
    postId,
    after,
    limit = COMMENT_PAGE_SIZE,
  }: { postId: string; after?: CommentCursor | null; limit?: number },
): Promise<CommentPage> {
  let query = supabase.from("comments").select(COMMENT_SELECT).eq("post_id", postId);
  if (after) {
    // Values are quoted: timestamps contain PostgREST's reserved `.` and `:`.
    query = query.or(
      `created_at.gt."${after.createdAt}",and(created_at.eq."${after.createdAt}",id.gt."${after.id}")`,
    );
  }
  // One extra row says whether another page exists.
  const { data, error } = await query
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit + 1);
  if (error) return { ok: false, error };

  const hasMore = data.length > limit;
  const comments = data.slice(0, limit).map((row) => toComment(row));
  const last = comments.at(-1);
  return {
    ok: true,
    comments,
    hasMore,
    nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}

/** Adds a rider's comment and returns it with its author. */
export async function addComment(
  supabase: Client,
  {
    postId,
    authorId,
    body,
    mapData,
  }: { postId: string; authorId: string; body: string; mapData: TablesInsert<"comments">["map_data"] },
): Promise<AddCommentResult> {
  const { data, error } = await supabase
    .from("comments")
    .insert({ post_id: postId, author_id: authorId, body, map_data: mapData ?? null })
    .select(COMMENT_SELECT)
    .single();
  if (error) return { ok: false, error };
  return { ok: true, comment: toComment(data) };
}

/**
 * Thread order: created time, then id, the same order `listComments` pages in.
 * Times compare as instants (the server may trim trailing fractional zeros),
 * falling back to the text for sub-millisecond differences.
 */
export function compareComments(
  a: Pick<Comment, "created_at" | "id">,
  b: Pick<Comment, "created_at" | "id">,
): number {
  const byInstant = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (byInstant !== 0) return byInstant;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Merges comments into a thread in order, keeping one copy of each. */
export function mergeComments(thread: readonly Comment[], incoming: readonly Comment[]): Comment[] {
  const byId = new Map<string, Comment>();
  for (const c of thread) byId.set(c.id, c);
  for (const c of incoming) byId.set(c.id, c);
  return [...byId.values()].sort(compareComments);
}

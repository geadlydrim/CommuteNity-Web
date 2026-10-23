/**
 * Post reads. Each takes the caller's Supabase client and the viewer's id
 * (null when signed out) and returns posts with the viewer's vote attached.
 *
 * The viewer's vote is an embed filtered to the viewer, so it arrives in the
 * same request as the posts. Signed-out reads skip the embed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  POST_COLUMNS,
  POST_COLUMNS_WITH_VIEWER_VOTE,
  POST_SELECT,
  POST_SELECT_WITH_VIEWER_VOTE,
} from "./select";
import { toPost, type Post, type PostAuthor, type PostList } from "./types";

type Client = SupabaseClient<Database>;

const POST_LIST_LIMIT = 50;

/** Public posts, newest first. */
export async function listFeedPosts(
  supabase: Client,
  viewerId: string | null,
): Promise<PostList> {
  const result = viewerId
    ? await supabase
        .from("posts")
        .select(POST_SELECT_WITH_VIEWER_VOTE)
        .eq("post_votes.user_id", viewerId)
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(POST_LIST_LIMIT)
    : await supabase
        .from("posts")
        .select(POST_SELECT)
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(POST_LIST_LIMIT);

  if (result.error) return { posts: null, error: result.error };
  return { posts: result.data.map((row) => toPost(row)), error: null };
}

/**
 * One author's public posts, newest first. The caller has already loaded the
 * author, so the posts are read without the author embed and it is attached.
 */
export async function listPostsByAuthor(
  supabase: Client,
  author: PostAuthor & { id: string },
  viewerId: string | null,
): Promise<PostList> {
  const result = viewerId
    ? await supabase
        .from("posts")
        .select(POST_COLUMNS_WITH_VIEWER_VOTE)
        .eq("post_votes.user_id", viewerId)
        .eq("user_id", author.id)
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(POST_LIST_LIMIT)
    : await supabase
        .from("posts")
        .select(POST_COLUMNS)
        .eq("user_id", author.id)
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(POST_LIST_LIMIT);

  if (result.error) return { posts: null, error: result.error };
  const postAuthor: PostAuthor = {
    username: author.username,
    display_name: author.display_name,
    avatar_url: author.avatar_url,
  };
  return {
    posts: result.data.map((row) => toPost(row, postAuthor)),
    error: null,
  };
}

/** One public post, or null if it doesn't exist or isn't public. */
export async function getPostById(
  supabase: Client,
  id: string,
  viewerId: string | null,
): Promise<Post | null> {
  const { data } = viewerId
    ? await supabase
        .from("posts")
        .select(POST_SELECT_WITH_VIEWER_VOTE)
        .eq("post_votes.user_id", viewerId)
        .eq("id", id)
        .eq("visibility", "public")
        .maybeSingle()
    : await supabase
        .from("posts")
        .select(POST_SELECT)
        .eq("id", id)
        .eq("visibility", "public")
        .maybeSingle();

  return data ? toPost(data) : null;
}

/**
 * The one place that says which columns make up a post.
 *
 * Every post read selects one of these strings; nothing outside the posts
 * module builds a post selection. The strings are `as const` so supabase-js
 * infers the row type from them, and that inferred row must fit `PostRow`
 * (`./types`) for the read to compile.
 */

/** The post's own columns and its comment count, without the author. */
export const POST_COLUMNS =
  "id, body, created_at, net_votes, map_data, comments(count)" as const;

/** A post with its author and comment count. */
export const POST_SELECT =
  `${POST_COLUMNS}, users(username, display_name, avatar_url)` as const;

/**
 * The viewer's vote, embedded in the same request. Only valid together with
 * the embedded-resource filter `.eq("post_votes.user_id", viewerId)`;
 * without it the embed returns every rider's vote.
 */
const VIEWER_VOTE_EMBED = "post_votes(value)" as const;

export const POST_SELECT_WITH_VIEWER_VOTE =
  `${POST_SELECT}, ${VIEWER_VOTE_EMBED}` as const;

/** For reads where the caller already has the author (the profile page). */
export const POST_COLUMNS_WITH_VIEWER_VOTE =
  `${POST_COLUMNS}, ${VIEWER_VOTE_EMBED}` as const;

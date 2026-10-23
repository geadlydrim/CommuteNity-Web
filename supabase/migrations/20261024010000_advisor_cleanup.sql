-- ============================================================
-- Supabase advisor cleanup.
--
-- 1. auth_rls_initplan: every RLS policy that calls auth.uid() is recreated
--    with (select auth.uid()) so Postgres evaluates the rider once per query
--    instead of once per row. Table, command, roles, USING / WITH CHECK, and
--    logic are unchanged.
-- 2. function_search_path_mutable: enforce_username_cooldown() gets a fixed
--    empty search path (its body only uses NOW() and INTERVAL from pg_catalog).
-- 3. unindexed_foreign_keys: comments are indexed by author.
-- 4. The catalog vote trigger (on_vote_change) and its function
--    (update_net_votes) are dropped; the catalog votes table stays.
--
-- spatial_ref_sys (PostGIS) is deliberately NOT changed here: it is owned by
-- supabase_admin, which also granted anon/authenticated their privileges, so
-- the migration role (postgres) can neither revoke those grants nor enable RLS.
-- ============================================================

-- ------------------------------------------------------------
-- 1. RLS policies: auth.uid() -> (select auth.uid())
-- ------------------------------------------------------------

-- users
DROP POLICY "users_update" ON public.users;
CREATE POLICY "users_update" ON public.users FOR UPDATE USING ((select auth.uid()) = id);

-- posts
DROP POLICY "posts_insert_own" ON public.posts;
CREATE POLICY "posts_insert_own" ON public.posts
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "posts_delete_own" ON public.posts;
CREATE POLICY "posts_delete_own" ON public.posts
  FOR DELETE USING ((select auth.uid()) = user_id);

-- post_votes
DROP POLICY "post_votes_insert_own" ON public.post_votes;
CREATE POLICY "post_votes_insert_own" ON public.post_votes
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "post_votes_update_own" ON public.post_votes;
CREATE POLICY "post_votes_update_own" ON public.post_votes
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY "post_votes_delete_own" ON public.post_votes;
CREATE POLICY "post_votes_delete_own" ON public.post_votes
  FOR DELETE USING ((select auth.uid()) = user_id);

-- comments
DROP POLICY "comments_insert_own" ON public.comments;
CREATE POLICY "comments_insert_own" ON public.comments
  FOR INSERT WITH CHECK ((select auth.uid()) = author_id);

DROP POLICY "comments_delete_own" ON public.comments;
CREATE POLICY "comments_delete_own" ON public.comments
  FOR DELETE USING ((select auth.uid()) = author_id);

-- stops (catalog; latest definition from 20261022000000_rider_write_guards)
DROP POLICY "stops_insert" ON public.stops;
CREATE POLICY "stops_insert" ON public.stops FOR INSERT WITH CHECK (
  created_by = (select auth.uid()) AND status = 'pending' AND net_votes = 0
);

-- routes (catalog; latest definition from 20261022000000_rider_write_guards)
DROP POLICY "routes_insert" ON public.routes;
CREATE POLICY "routes_insert" ON public.routes FOR INSERT WITH CHECK (
  created_by = (select auth.uid()) AND status = 'pending' AND net_votes = 0
);

-- edit_proposals (catalog)
DROP POLICY "proposals_read" ON public.edit_proposals;
CREATE POLICY "proposals_read" ON public.edit_proposals FOR SELECT USING ((select auth.uid()) IS NOT NULL);

DROP POLICY "proposals_insert" ON public.edit_proposals;
CREATE POLICY "proposals_insert" ON public.edit_proposals FOR INSERT WITH CHECK (
  proposed_by = (select auth.uid()) AND status = 'pending' AND net_votes = 0
  AND reviewed_by IS NULL AND resolved_at IS NULL
);

-- votes (catalog)
DROP POLICY "votes_read" ON public.votes;
CREATE POLICY "votes_read" ON public.votes FOR SELECT USING ((select auth.uid()) IS NOT NULL);

DROP POLICY "votes_insert" ON public.votes;
CREATE POLICY "votes_insert" ON public.votes FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "votes_delete" ON public.votes;
CREATE POLICY "votes_delete" ON public.votes FOR DELETE USING ((select auth.uid()) = user_id);

-- reports (catalog; latest definition from 20261022000000_rider_write_guards)
DROP POLICY "reports_insert" ON public.reports;
CREATE POLICY "reports_insert" ON public.reports FOR INSERT WITH CHECK (
  reported_by = (select auth.uid()) AND status = 'open'
);

-- ------------------------------------------------------------
-- 2. Fixed search path for the username-cooldown trigger function.
--    NOW() and INTERVAL resolve from pg_catalog, which is always searched.
-- ------------------------------------------------------------
ALTER FUNCTION public.enforce_username_cooldown() SET search_path = '';

-- ------------------------------------------------------------
-- 3. Index comments by author (foreign key to public.users).
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS comments_author_id_idx ON public.comments (author_id);

-- ------------------------------------------------------------
-- 4. Drop the catalog vote trigger and its function. The catalog is parked;
--    a catalog vote no longer recounts net_votes or auto-approves/rejects.
--    The votes table stays.
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS on_vote_change ON public.votes;
DROP FUNCTION IF EXISTS public.update_net_votes();

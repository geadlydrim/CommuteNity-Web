-- ============================================================
-- Riders may change only their username, display name, and avatar.
-- reputation and username_changed_at are database-managed
-- (the username-cooldown trigger sets username_changed_at).
-- ============================================================

REVOKE UPDATE ON public.users FROM anon, authenticated;
GRANT UPDATE (username, display_name, avatar_url) ON public.users TO authenticated;

-- ============================================================
-- A rider's avatar is their default placeholder or a photo in their own
-- folder of the avatars bucket. Privileged roles are not restricted, and
-- existing values are only checked when they change.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_avatar_url()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user <> 'authenticated' OR NEW.avatar_url IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.avatar_url = 'https://api.dicebear.com/9.x/identicon/svg?seed=' || NEW.id
     OR NEW.avatar_url ~ (
       '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/'
       || NEW.id::text || '/[^/?#]+(\?[^#]*)?$'
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'avatar_url_invalid'
    USING HINT = 'Avatar must be your default placeholder or a photo in your own avatars folder';
END;
$$;

CREATE TRIGGER avatar_url_check
  BEFORE UPDATE OF avatar_url ON public.users
  FOR EACH ROW
  WHEN (NEW.avatar_url IS DISTINCT FROM OLD.avatar_url)
  EXECUTE PROCEDURE public.enforce_avatar_url();

-- ============================================================
-- Catalog submissions start pending, unvoted, unreviewed, and in the
-- submitter's own name.
-- ============================================================

DROP POLICY "stops_insert" ON public.stops;
CREATE POLICY "stops_insert" ON public.stops FOR INSERT WITH CHECK (
  created_by = auth.uid() AND status = 'pending' AND net_votes = 0
);

DROP POLICY "routes_insert" ON public.routes;
CREATE POLICY "routes_insert" ON public.routes FOR INSERT WITH CHECK (
  created_by = auth.uid() AND status = 'pending' AND net_votes = 0
);

DROP POLICY "proposals_insert" ON public.edit_proposals;
CREATE POLICY "proposals_insert" ON public.edit_proposals FOR INSERT WITH CHECK (
  proposed_by = auth.uid() AND status = 'pending' AND net_votes = 0
  AND reviewed_by IS NULL AND resolved_at IS NULL
);

DROP POLICY "reports_insert" ON public.reports;
CREATE POLICY "reports_insert" ON public.reports FOR INSERT WITH CHECK (
  reported_by = auth.uid() AND status = 'open'
);

-- Riders can't read pending routes (routes_read is approved-only), so the
-- ownership check runs with the definer's rights.
CREATE OR REPLACE FUNCTION public.is_own_pending_route(p_route_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.routes
    WHERE id = p_route_id AND created_by = auth.uid() AND status = 'pending'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_own_pending_route(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_own_pending_route(UUID) TO authenticated;

DROP POLICY "segments_insert" ON public.route_segments;
CREATE POLICY "segments_insert" ON public.route_segments FOR INSERT WITH CHECK (
  public.is_own_pending_route(route_id)
);

-- ============================================================
-- Avatars: common image types up to 5 MiB; owners can remove their own
-- photos (so replaced avatars don't pile up).
-- ============================================================

UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']
WHERE id = 'avatars';

CREATE POLICY "avatars_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- Post vote sync runs as definer; pin its search path. The body already
-- uses schema-qualified names.
-- ============================================================

ALTER FUNCTION public.sync_post_net_votes() SET search_path = '';

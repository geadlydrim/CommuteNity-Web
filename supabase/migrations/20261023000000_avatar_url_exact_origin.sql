-- ============================================================
-- Tighten the avatar guard from 20261022000000_rider_write_guards.sql:
-- accept photos only from this project's own storage (the origin named by
-- the rider's access-token issuer, not any *.supabase.co host), allow
-- subfolders inside the rider's folder, and reject dot segments that would
-- resolve outside it.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_avatar_url()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  -- e.g. https://<ref>.supabase.co/auth/v1 → https://<ref>.supabase.co
  project_origin TEXT := regexp_replace(auth.jwt() ->> 'iss', '/auth/v1/?$', '');
  own_folder TEXT;
BEGIN
  IF current_user <> 'authenticated' OR NEW.avatar_url IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.avatar_url = 'https://api.dicebear.com/9.x/identicon/svg?seed=' || NEW.id THEN
    RETURN NEW;
  END IF;

  own_folder := project_origin || '/storage/v1/object/public/avatars/' || NEW.id::text || '/';

  IF project_origin <> ''
     AND left(NEW.avatar_url, length(own_folder)) = own_folder
     AND substr(NEW.avatar_url, length(own_folder) + 1) ~ '^[^?#]+(\?[^#]*)?$'
     AND split_part(NEW.avatar_url, '?', 1) !~* '(^|/)(\.|%2e){1,2}(/|$)' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'avatar_url_invalid'
    USING HINT = 'Avatar must be your default placeholder or a photo in your own avatars folder';
END;
$$;

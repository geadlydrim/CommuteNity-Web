-- ============================================================
-- Profile-creation trigger: sign-up must never fail because of its metadata.
--
-- public.users is the only home of a rider's username, display name, and
-- avatar (ADR 0006). Sign-up metadata is input to this trigger only. Until
-- now the trigger copied it verbatim, so a mixed-case, malformed, or taken
-- username violated users_username_format / users_username_unique and GoTrue
-- rejected the whole sign-up ("Database error saving new user").
--
-- New rules:
-- - username: lower(btrim(meta username)), kept only if it matches the
--   username format and no rider has it; otherwise NULL, and the middleware
--   gate sends the rider to onboarding to pick one. A concurrent sign-up that
--   takes the same username between the check and the insert raises
--   unique_violation; the insert is retried with a NULL username.
-- - display_name: first non-blank of meta display_name, full_name, name
--   (Google supplies the last two), trimmed and cut to 40 characters (the
--   form's limit); otherwise NULL.
-- - avatar_url: the deterministic dicebear placeholder, unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  wanted_username text := lower(btrim(meta ->> 'username'));
  initial_display_name text := left(
    COALESCE(
      NULLIF(btrim(meta ->> 'display_name'), ''),
      NULLIF(btrim(meta ->> 'full_name'), ''),
      NULLIF(btrim(meta ->> 'name'), '')
    ),
    40
  );
  placeholder_avatar text :=
    'https://api.dicebear.com/9.x/identicon/svg?seed=' || NEW.id;
BEGIN
  IF wanted_username IS NULL
     OR wanted_username !~ '^[a-z0-9_]{3,20}$'
     OR EXISTS (SELECT 1 FROM public.users WHERE username = wanted_username)
  THEN
    wanted_username := NULL;
  END IF;

  BEGIN
    INSERT INTO public.users (id, username, display_name, avatar_url)
    VALUES (NEW.id, wanted_username, initial_display_name, placeholder_avatar);
  EXCEPTION WHEN unique_violation THEN
    -- Lost a race for the username: create the profile without one.
    INSERT INTO public.users (id, username, display_name, avatar_url)
    VALUES (NEW.id, NULL, initial_display_name, placeholder_avatar);
  END;

  RETURN NEW;
END;
$$;

ALTER TABLE public.users
  ADD COLUMN username_changed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.enforce_username_cooldown()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.username IS DISTINCT FROM OLD.username THEN
    IF OLD.username_changed_at IS NOT NULL
       AND OLD.username_changed_at > NOW() - INTERVAL '30 days' THEN
      RAISE EXCEPTION 'username_cooldown'
        USING HINT = 'Username can only be changed once every 30 days';
    END IF;
    NEW.username_changed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER username_cooldown_check
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE PROCEDURE public.enforce_username_cooldown();

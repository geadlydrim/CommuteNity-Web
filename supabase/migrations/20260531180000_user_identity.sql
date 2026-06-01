ALTER TABLE public.users
  ADD COLUMN username TEXT;

ALTER TABLE public.users
  ADD CONSTRAINT users_username_format
    CHECK (username ~ '^[a-z0-9_]{3,20}$');

ALTER TABLE public.users
  ADD CONSTRAINT users_username_unique UNIQUE (username);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, username, display_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'username',
    NEW.raw_user_meta_data ->> 'display_name'
  );
  RETURN NEW;
END;
$$;

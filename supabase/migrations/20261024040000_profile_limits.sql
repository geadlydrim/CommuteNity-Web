-- Profile limits: cap display names at 40 characters (matching the form schema)
-- and avatar URLs at 512, so a rider can't bypass the client and store
-- oversized profile fields. Live data at time of writing: longest display name
-- 13, longest avatar URL 136.

alter table public.users
  add constraint users_display_name_length
    check (display_name is null or char_length(display_name) <= 40),
  add constraint users_avatar_url_length
    check (avatar_url is null or char_length(avatar_url) <= 512);

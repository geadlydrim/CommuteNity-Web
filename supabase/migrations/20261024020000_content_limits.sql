-- Content limits enforced by the database, not just the app.
--
-- Zod trims and caps input in the app, but a rider can write to posts and
-- comments directly through the Supabase API, so the database must hold the
-- line itself:
--   * Bodies must contain something other than whitespace. The existing
--     1-500 length CHECK on posts.body stays as is; it accepts "   ".
--   * map_data (post maps on posts, guides on comments) is capped at 16 KiB.
--     Real documents are far smaller (largest post map 416 B, largest guide
--     1046 B at the time of writing), so the cap only stops abuse.
-- Live data was checked before writing this: no blank bodies and no oversized
-- maps, so the constraints validate immediately.

-- btrim's default only strips spaces, so name the whitespace characters.
ALTER TABLE public.posts ADD CONSTRAINT posts_body_not_blank
  CHECK (length(btrim(body, E' \t\r\n')) > 0);

ALTER TABLE public.comments ADD CONSTRAINT comments_body_not_blank
  CHECK (length(btrim(body, E' \t\r\n')) > 0);

ALTER TABLE public.posts ADD CONSTRAINT posts_map_data_size
  CHECK (map_data IS NULL OR pg_column_size(map_data) <= 16384);

ALTER TABLE public.comments ADD CONSTRAINT comments_map_data_size
  CHECK (map_data IS NULL OR pg_column_size(map_data) <= 16384);

-- Add optional map_data JSONB column to posts.
-- map_data holds an ordered pin list: { version: 1, pins: [{lat,lng,label},...] }
-- NULL = no map attached to the post.
-- Pin-count and coordinate validation is handled at the app layer (zod).
-- RLS is unchanged — existing posts_insert_own policy covers the new column.

ALTER TABLE public.posts ADD COLUMN map_data jsonb;

ALTER TABLE public.posts ADD CONSTRAINT posts_map_data_is_object
  CHECK (map_data IS NULL OR jsonb_typeof(map_data) = 'object');

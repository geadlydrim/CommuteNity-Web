-- Add map_data JSONB column to comments so commenters can attach guide maps.
-- Mirrors the pattern used for posts.map_data (20260607000000_post_map_data.sql).
-- Application-layer zod validation enforces the shape; DB only checks it is an object.

ALTER TABLE public.comments ADD COLUMN map_data jsonb;

ALTER TABLE public.comments ADD CONSTRAINT comments_map_data_is_object
  CHECK (map_data IS NULL OR jsonb_typeof(map_data) = 'object');

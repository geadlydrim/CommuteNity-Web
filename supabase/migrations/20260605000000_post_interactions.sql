-- Add net_votes to posts
ALTER TABLE public.posts ADD COLUMN net_votes INTEGER NOT NULL DEFAULT 0;

-- post_votes: one vote per user per post
CREATE TABLE public.post_votes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  value      SMALLINT NOT NULL CHECK (value IN (1, -1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX ON public.post_votes (post_id);
CREATE INDEX ON public.post_votes (user_id);

ALTER TABLE public.post_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_votes_read" ON public.post_votes
  FOR SELECT USING (true);

CREATE POLICY "post_votes_insert_own" ON public.post_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "post_votes_update_own" ON public.post_votes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "post_votes_delete_own" ON public.post_votes
  FOR DELETE USING (auth.uid() = user_id);

-- comments table
CREATE TABLE public.comments (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id   UUID NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body      TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON public.comments (post_id, created_at);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_read" ON public.comments
  FOR SELECT USING (true);

CREATE POLICY "comments_insert_own" ON public.comments
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "comments_delete_own" ON public.comments
  FOR DELETE USING (auth.uid() = author_id);

-- Trigger: keep posts.net_votes in sync with post_votes
CREATE OR REPLACE FUNCTION public.sync_post_net_votes()
RETURNS TRIGGER AS $$
DECLARE
  target_post_id UUID;
BEGIN
  target_post_id := COALESCE(NEW.post_id, OLD.post_id);
  UPDATE public.posts
  SET net_votes = COALESCE(
    (SELECT SUM(value) FROM public.post_votes WHERE post_id = target_post_id),
    0
  )
  WHERE id = target_post_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_post_net_votes
  AFTER INSERT OR UPDATE OR DELETE ON public.post_votes
  FOR EACH ROW EXECUTE FUNCTION public.sync_post_net_votes();

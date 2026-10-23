-- ============================================================
-- Count every post vote exactly, even when riders vote at the same moment.
--
-- The trigger used to recount: posts.net_votes = SUM(post_votes.value).
-- Under READ COMMITTED each voter's SUM comes from a snapshot that can't see
-- the other's uncommitted vote. The second voter waits on the posts row lock,
-- then writes its stale SUM over the first voter's total, and a vote is lost.
--
-- Now each vote adjusts the total by the change it makes. `net_votes + n`
-- is re-evaluated against the latest row version after the lock wait, so
-- concurrent votes add up. The trigger itself (trg_sync_post_net_votes)
-- already calls this function and is unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_post_net_votes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts
    SET net_votes = net_votes + NEW.value
    WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts
    SET net_votes = net_votes - OLD.value
    WHERE id = OLD.post_id;
  ELSIF NEW.post_id = OLD.post_id THEN
    UPDATE public.posts
    SET net_votes = net_votes + NEW.value - OLD.value
    WHERE id = NEW.post_id;
  ELSE
    UPDATE public.posts
    SET net_votes = net_votes - OLD.value
    WHERE id = OLD.post_id;
    UPDATE public.posts
    SET net_votes = net_votes + NEW.value
    WHERE id = NEW.post_id;
  END IF;
  RETURN NULL;
END;
$$;

-- Adjusting keeps whatever total a post already has, so correct the totals
-- that earlier lost votes once.
UPDATE public.posts AS p
SET net_votes = t.total
FROM (
  SELECT p2.id, COALESCE(SUM(v.value), 0)::integer AS total
  FROM public.posts AS p2
  LEFT JOIN public.post_votes AS v ON v.post_id = p2.id
  GROUP BY p2.id
) AS t
WHERE t.id = p.id
  AND p.net_votes IS DISTINCT FROM t.total;

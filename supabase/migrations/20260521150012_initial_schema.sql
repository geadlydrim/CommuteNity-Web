-- Enable PostGIS for geographic stop locations
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- TABLES
-- ============================================================

-- Public user profiles, synced from auth.users via trigger
CREATE TABLE public.users (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url   TEXT,
  reputation   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.stops (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  location    GEOGRAPHY(Point, 4326) NOT NULL,
  mode        TEXT NOT NULL CHECK (mode IN ('jeepney','bus','mrt','lrt','uv_express','p2p','tricycle','walking')),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  net_votes   INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.routes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  mode        TEXT NOT NULL CHECK (mode IN ('jeepney','bus','mrt','lrt','uv_express','p2p','tricycle','walking')),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  notes       TEXT,
  net_votes   INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES public.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ordered stop-to-stop legs within a route
CREATE TABLE public.route_segments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id         UUID NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  sequence         INTEGER NOT NULL,
  from_stop_id     UUID NOT NULL REFERENCES public.stops(id),
  to_stop_id       UUID NOT NULL REFERENCES public.stops(id),
  fare             NUMERIC(8,2),
  duration_minutes INTEGER,
  notes            TEXT,
  UNIQUE (route_id, sequence)
);

-- Community edits pending review
CREATE TABLE public.edit_proposals (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type    TEXT NOT NULL CHECK (target_type IN ('route','stop','segment')),
  target_id      UUID NOT NULL,
  proposed_by    UUID REFERENCES public.users(id),
  change_payload JSONB NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by    UUID REFERENCES public.users(id),
  net_votes      INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ
);

-- One vote per user per target
CREATE TABLE public.votes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.users(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('route','stop','edit_proposal')),
  target_id   UUID NOT NULL,
  value       SMALLINT NOT NULL CHECK (value IN (1, -1)),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, target_type, target_id)
);

-- User flags on content
CREATE TABLE public.reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_by UUID REFERENCES public.users(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('route','stop','edit_proposal')),
  target_id   UUID NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('wrong_fare','outdated','duplicate','spam','other')),
  notes       TEXT,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX ON public.stops USING GIST (location);
CREATE INDEX ON public.stops (mode);
CREATE INDEX ON public.stops (status);
CREATE INDEX ON public.routes (mode);
CREATE INDEX ON public.routes (status);
CREATE INDEX ON public.routes (net_votes);
CREATE INDEX ON public.route_segments (route_id);
CREATE INDEX ON public.votes (user_id, target_type, target_id);
CREATE INDEX ON public.edit_proposals (status);
CREATE INDEX ON public.reports (status);

-- ============================================================
-- TRIGGER: auto-create public.users on auth signup
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, display_name)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'display_name'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- TRIGGER: recalculate net_votes + auto-approve/reject on vote change
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_net_votes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_net         INTEGER;
  v_target_type TEXT;
  v_target_id   UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_target_type := OLD.target_type;
    v_target_id   := OLD.target_id;
  ELSE
    v_target_type := NEW.target_type;
    v_target_id   := NEW.target_id;
  END IF;

  SELECT COALESCE(SUM(value), 0) INTO v_net
  FROM public.votes
  WHERE target_type = v_target_type AND target_id = v_target_id;

  IF v_target_type = 'route' THEN
    UPDATE public.routes
    SET net_votes = v_net,
        status = CASE
          WHEN v_net >= 5  AND status = 'pending' THEN 'approved'
          WHEN v_net <= -3 AND status = 'pending' THEN 'rejected'
          ELSE status
        END
    WHERE id = v_target_id;

  ELSIF v_target_type = 'stop' THEN
    UPDATE public.stops
    SET net_votes = v_net,
        status = CASE
          WHEN v_net >= 5  AND status = 'pending' THEN 'approved'
          WHEN v_net <= -3 AND status = 'pending' THEN 'rejected'
          ELSE status
        END
    WHERE id = v_target_id;

  ELSIF v_target_type = 'edit_proposal' THEN
    UPDATE public.edit_proposals
    SET net_votes = v_net,
        status = CASE
          WHEN v_net >= 5  AND status = 'pending' THEN 'approved'
          WHEN v_net <= -3 AND status = 'pending' THEN 'rejected'
          ELSE status
        END
    WHERE id = v_target_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER on_vote_change
  AFTER INSERT OR UPDATE OR DELETE ON public.votes
  FOR EACH ROW EXECUTE PROCEDURE public.update_net_votes();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stops          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.routes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.route_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edit_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports        ENABLE ROW LEVEL SECURITY;

-- users: anyone reads; owner updates their own row
CREATE POLICY "users_read"   ON public.users FOR SELECT USING (true);
CREATE POLICY "users_update" ON public.users FOR UPDATE USING (auth.uid() = id);

-- stops: anyone reads approved; authenticated users insert pending
CREATE POLICY "stops_read"   ON public.stops FOR SELECT USING (status = 'approved');
CREATE POLICY "stops_insert" ON public.stops FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- routes: anyone reads approved; authenticated users insert pending
CREATE POLICY "routes_read"   ON public.routes FOR SELECT USING (status = 'approved');
CREATE POLICY "routes_insert" ON public.routes FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- route_segments: readable if parent route is approved
CREATE POLICY "segments_read" ON public.route_segments FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.routes
    WHERE id = route_segments.route_id AND status = 'approved'
  )
);
CREATE POLICY "segments_insert" ON public.route_segments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- edit_proposals: authenticated users read and insert
CREATE POLICY "proposals_read"   ON public.edit_proposals FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "proposals_insert" ON public.edit_proposals FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- votes: authenticated users read and manage their own
CREATE POLICY "votes_read"   ON public.votes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "votes_insert" ON public.votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "votes_delete" ON public.votes FOR DELETE USING (auth.uid() = user_id);

-- reports: authenticated users insert; read via dashboard only
CREATE POLICY "reports_insert" ON public.reports FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

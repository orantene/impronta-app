-- D4 slice 1 — client favorites (single-talent forever-list).
--
-- Personal heart-icon save list per client user. NOT a shortlist (those
-- are named, event-bound, multi-talent — separate table client_shortlists
-- shipping in D4 slice 2). Favorites are the lightweight "I want to
-- remember this person" save without committing to a project context.
--
-- See: web/docs/discover-and-unified-inquiry-2026-05-14.md §2.5 + §6.1.

CREATE TABLE IF NOT EXISTS public.client_favorites (
  client_user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  added_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (client_user_id, talent_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_client_favorites_user_added
  ON public.client_favorites (client_user_id, added_at DESC);

CREATE INDEX IF NOT EXISTS idx_client_favorites_talent
  ON public.client_favorites (talent_profile_id);

COMMENT ON TABLE public.client_favorites IS
  'Per-client personal save list. Single-talent ♥ favorites — distinct from named/event-bound shortlists. See project_discover_unified.md §2.5.';

-- RLS — a client sees and mutates only their own favorites. Service-role
-- bypasses for engine reads (Discover surface, talent-side "X clients
-- saved you this week" aggregate counter).
ALTER TABLE public.client_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_favorites_own_read ON public.client_favorites;
CREATE POLICY client_favorites_own_read
  ON public.client_favorites FOR SELECT
  USING (client_user_id = auth.uid());

DROP POLICY IF EXISTS client_favorites_own_insert ON public.client_favorites;
CREATE POLICY client_favorites_own_insert
  ON public.client_favorites FOR INSERT
  WITH CHECK (client_user_id = auth.uid());

DROP POLICY IF EXISTS client_favorites_own_delete ON public.client_favorites;
CREATE POLICY client_favorites_own_delete
  ON public.client_favorites FOR DELETE
  USING (client_user_id = auth.uid());

-- D4 slice 2 — client shortlists (named multi-talent groups).
--
-- Distinct from client_favorites (D4 slice 1) which is a single-talent
-- forever-list. Shortlists are named, event-bound, multi-talent — what
-- the buyer builds before sending a fanned cross-tenant inquiry (D5).
--
-- See: web/docs/discover-and-unified-inquiry-2026-05-14.md §2.5 + §6.1.

CREATE TABLE IF NOT EXISTS public.client_shortlists (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL CHECK (length(trim(name)) > 0),
  event_date_hint DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_shortlists_user_created
  ON public.client_shortlists (client_user_id, created_at DESC);

COMMENT ON TABLE public.client_shortlists IS
  'Per-client named multi-talent group (e.g. "Brand X Gala 2026"). Draft state for the cross-tenant inquiry fan-out (D5). See project_discover_unified.md §2.5.';

CREATE TABLE IF NOT EXISTS public.client_shortlist_items (
  shortlist_id      UUID NOT NULL REFERENCES public.client_shortlists(id) ON DELETE CASCADE,
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  added_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  position          INT,
  PRIMARY KEY (shortlist_id, talent_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_client_shortlist_items_shortlist
  ON public.client_shortlist_items (shortlist_id, added_at DESC);

COMMENT ON TABLE public.client_shortlist_items IS
  'Talents on a shortlist. position is optional manual order; default sort is added_at desc.';

-- RLS — client sees + mutates their own shortlists; items inherit scope
-- via shortlist ownership.
ALTER TABLE public.client_shortlists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_shortlists_own_select ON public.client_shortlists;
CREATE POLICY client_shortlists_own_select
  ON public.client_shortlists FOR SELECT
  USING (client_user_id = auth.uid());

DROP POLICY IF EXISTS client_shortlists_own_insert ON public.client_shortlists;
CREATE POLICY client_shortlists_own_insert
  ON public.client_shortlists FOR INSERT
  WITH CHECK (client_user_id = auth.uid());

DROP POLICY IF EXISTS client_shortlists_own_update ON public.client_shortlists;
CREATE POLICY client_shortlists_own_update
  ON public.client_shortlists FOR UPDATE
  USING (client_user_id = auth.uid())
  WITH CHECK (client_user_id = auth.uid());

DROP POLICY IF EXISTS client_shortlists_own_delete ON public.client_shortlists;
CREATE POLICY client_shortlists_own_delete
  ON public.client_shortlists FOR DELETE
  USING (client_user_id = auth.uid());

ALTER TABLE public.client_shortlist_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_shortlist_items_via_shortlist_select ON public.client_shortlist_items;
CREATE POLICY client_shortlist_items_via_shortlist_select
  ON public.client_shortlist_items FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.client_shortlists s
    WHERE s.id = client_shortlist_items.shortlist_id
      AND s.client_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS client_shortlist_items_via_shortlist_insert ON public.client_shortlist_items;
CREATE POLICY client_shortlist_items_via_shortlist_insert
  ON public.client_shortlist_items FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.client_shortlists s
    WHERE s.id = client_shortlist_items.shortlist_id
      AND s.client_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS client_shortlist_items_via_shortlist_delete ON public.client_shortlist_items;
CREATE POLICY client_shortlist_items_via_shortlist_delete
  ON public.client_shortlist_items FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.client_shortlists s
    WHERE s.id = client_shortlist_items.shortlist_id
      AND s.client_user_id = auth.uid()
  ));

-- Auto-bump shortlist.updated_at when items change so the listing page
-- can sort by "recently modified" without an extra query.
CREATE OR REPLACE FUNCTION public.trg_touch_client_shortlist()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.client_shortlists
     SET updated_at = NOW()
   WHERE id = COALESCE(NEW.shortlist_id, OLD.shortlist_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_client_shortlist_items_touch ON public.client_shortlist_items;
CREATE TRIGGER trg_client_shortlist_items_touch
  AFTER INSERT OR DELETE ON public.client_shortlist_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_touch_client_shortlist();

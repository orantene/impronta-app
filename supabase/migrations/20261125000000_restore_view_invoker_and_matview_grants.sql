-- 20261125000000_restore_view_invoker_and_matview_grants.sql
--
-- Restore an intended security property that a later CREATE OR REPLACE silently
-- wiped, and stop handing write grants on a read-only catalog.
--
-- Timestamp note: local sequence, not wall clock. See 20261124000000.
--
--
-- 1. talent_skills_resolved — security_invoker regression
-- ══════════════════════════════════════════════════════
-- 20260615194712_security_invoker_views.sql set `security_invoker = on` on this
-- view. 20260907250000_talent_skill_metrics_v1.sql then extended it with
-- booking_count + last_booked_at via CREATE OR REPLACE VIEW — which does NOT
-- preserve reloptions. The view silently reverted to SECURITY DEFINER and the
-- advisor has flagged `security_definer_view` ever since.
--
-- Verified live before writing: pg_class.reloptions IS NULL for this view.
--
-- Under security_invoker the underlying RLS applies to the CALLER:
--   • anon still sees skills of publicly visible talent (talent_taxonomy_select)
--   • anon STOPS seeing skills of hidden / non-public talent  ← the actual gain
--   • booking metrics stay NULL for anon (staff-only base table). Benign — the
--     columns are additive and public callers never rendered them.
--
-- This is the regression-prone half of this migration. Post-push check is a
-- public /t/<slug> profile: skill chips must still render.
BEGIN;

ALTER VIEW public.talent_skills_resolved SET (security_invoker = on);


-- 2. inquiry_offer_line_items_talent_view — STAYS SECURITY DEFINER
-- ═══════════════════════════════════════════════════════════════
-- Deliberately untouched. 20260615194712 excluded it by name and explained why:
-- it is the talent-self path to a talent's OWN offer line-item costs, and the
-- base table inquiry_offer_line_items is not readable by the talent directly.
-- Flipping it to invoker blanks that money UI. The advisor will keep reporting
-- one `security_definer_view` for this view; that is accepted and intentional.
--
-- Hygiene only: anon has no business reading it. authenticated talent keeps
-- SELECT, which is the whole point of the view.
REVOKE SELECT ON public.inquiry_offer_line_items_talent_view FROM anon;


-- 3. talent_discover_index — matview grants
-- ════════════════════════════════════════
-- Postgres cannot put RLS on a materialized view, so grants ARE the access
-- control here. Live check showed anon holding DELETE as well as SELECT — the
-- matview was created with a blanket GRANT ALL. The public directory only ever
-- reads it, and REFRESH is performed by service_role.
--
-- The remaining `materialized_view_in_api` advisor WARN is accepted: this is the
-- public directory catalog and it must stay readable by anon. Row-level gating
-- happens upstream in the refresh query (see
-- 20261111100000_discover_index_restore_public_listing_gate.sql), not here.
REVOKE ALL ON public.talent_discover_index FROM anon, authenticated;
GRANT SELECT ON public.talent_discover_index TO anon, authenticated;


-- ─── Assertions ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class
     WHERE oid = 'public.talent_skills_resolved'::regclass
       AND reloptions @> ARRAY['security_invoker=on']
  ) THEN
    RAISE EXCEPTION 'assertion failed: security_invoker not set on talent_skills_resolved';
  END IF;

  -- The public directory breaks if anon cannot read the catalog.
  IF NOT has_table_privilege('anon', 'public.talent_discover_index', 'SELECT') THEN
    RAISE EXCEPTION 'assertion failed: anon LOST select on talent_discover_index — the public directory would go blank';
  END IF;
  IF has_table_privilege('anon', 'public.talent_discover_index', 'DELETE')
     OR has_table_privilege('anon', 'public.talent_discover_index', 'UPDATE')
     OR has_table_privilege('anon', 'public.talent_discover_index', 'INSERT') THEN
    RAISE EXCEPTION 'assertion failed: anon still holds write grants on talent_discover_index';
  END IF;

  -- The talent line-item view must remain readable by logged-in talent.
  IF NOT has_table_privilege('authenticated', 'public.inquiry_offer_line_items_talent_view', 'SELECT') THEN
    RAISE EXCEPTION 'assertion failed: authenticated LOST select on inquiry_offer_line_items_talent_view — talent offer costs would blank';
  END IF;
END;
$$;

COMMIT;

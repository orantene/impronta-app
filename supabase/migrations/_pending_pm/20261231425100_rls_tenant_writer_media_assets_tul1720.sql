-- TUL-1720 (P1, staging QA re-fail): media_assets is wave 3 of the
-- "FOR ALL is_staff_of_tenant" RLS fix, missed by #4316's wave 1 (9 tables).
-- A viewer (and a pending-acceptance invitee) could UPDATE/INSERT/DELETE
-- media_assets directly over PostgREST, bypassing every server-action guard.
--
-- HELD: lives in _pending_pm until the Production Migration Manager applies
-- it. NOT applied by the author.
--
-- media_assets never actually calls is_staff_of_tenant() by name -- both of
-- its FOR ALL policies inline the identical "super_admin OR any active/
-- pending member, any role" check, which is why a literal text search for
-- the helper's name misses it. Confirmed directly against fxlank via
-- pg_policies (not guessed): is_platform_admin() is the exact same predicate
-- as the inline profiles.app_role = 'super_admin' check both policies used,
-- so it is a faithful drop-in for the super_admin half of each.
--
-- Reads (media_select) and the talent's own write of their own asset
-- (media_update_talent, media_write_talent, both keyed on
-- owner_talent_profile_id) are UNCHANGED -- this only narrows the STAFF
-- write path from "any active or pending member" to is_tenant_writer
-- (active editor+, from 20261231424000's wave 1).
--
-- media_write_staff had no `purpose` filter, so in practice it already
-- governed every staff write media_assets_tenant_staff_all's narrower
-- `purpose <> 'talent'` clause also covered, plus talent-purpose rows too.
-- Replacing both with one editor+ policy set (no purpose filter, matching
-- media_write_staff's actual effective shape) is behavior-preserving for
-- every ALLOWED case; it only removes the viewer/pending-acceptance case.
--
-- Idempotent (DROP POLICY IF EXISTS before every CREATE).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.media_assets') IS NOT NULL THEN
    DROP POLICY IF EXISTS media_assets_tenant_staff_all ON public.media_assets;
    DROP POLICY IF EXISTS media_write_staff ON public.media_assets;

    DROP POLICY IF EXISTS media_assets_staff_insert ON public.media_assets;
    CREATE POLICY media_assets_staff_insert ON public.media_assets
      FOR INSERT
      TO authenticated
      WITH CHECK (public.is_tenant_writer(tenant_id));

    DROP POLICY IF EXISTS media_assets_staff_update ON public.media_assets;
    CREATE POLICY media_assets_staff_update ON public.media_assets
      FOR UPDATE
      TO authenticated
      USING       (public.is_tenant_writer(tenant_id))
      WITH CHECK  (public.is_tenant_writer(tenant_id));

    DROP POLICY IF EXISTS media_assets_staff_delete ON public.media_assets;
    CREATE POLICY media_assets_staff_delete ON public.media_assets
      FOR DELETE
      TO authenticated
      USING (public.is_tenant_writer(tenant_id));
  END IF;
END
$$;

COMMIT;

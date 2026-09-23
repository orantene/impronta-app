-- 20261124000000_lock_leftovers_and_revoke_anon_definer_rpcs enables RLS on,
-- revokes grants from and comments public._impronta_pages_backup_20260817, then
-- asserts relrowsecurity and that anon holds neither SELECT nor DELETE. No
-- migration creates that table: the migration's own header calls it "a 52-row
-- CMS page snapshot left behind by a manual backup", so from scratch the first
-- ALTER TABLE fails with
--     ERROR:  relation "public._impronta_pages_backup_20260817" does not exist
--
-- WHERE THE COLUMN LIST COMES FROM
--   web/src/lib/supabase/database.types.ts, generated FROM production, is the
--   only record of this table's shape. It lists these 38 columns, every one of
--   them nullable and with no primary key — the signature of a
--   `CREATE TABLE … AS SELECT * FROM impronta_pages` snapshot rather than a
--   declared table. The source table `impronta_pages` is itself out of band:
--   no migration creates it and it is not in database.types.ts either, so the
--   snapshot cannot be reproduced by copying it, and the columns are written
--   out here instead.
--
-- THE 52 ROWS ARE NOT REPRODUCED: they are production CMS content, and
-- 20261124000000 only changes RLS, grants and the table comment, so it sees
-- the same object either way. Nothing reads the table — the migration checked
-- (`grep -r _impronta_pages_backup web/src supabase` → only itself) — so no
-- column here is load-bearing for any query. What matters is that the relation
-- exists and carries the grants the migration is there to take away.
CREATE TABLE IF NOT EXISTS public._impronta_pages_backup_20260817 (
  id                          uuid,
  tenant_id                   uuid,
  slug                        text,
  locale                      text,
  title                       text,
  body                        text,
  blocks                      jsonb,
  hero                        jsonb,
  status                      public.cms_page_status,
  version                     integer,
  draft_seq                   integer,
  edit_session_id             uuid,
  is_freeform                 boolean,
  is_system_owned             boolean,
  include_in_sitemap          boolean,
  noindex                     boolean,
  canonical_url               text,
  json_ld                     jsonb,
  meta_title                  text,
  meta_description            text,
  og_title                    text,
  og_description              text,
  og_image_url                text,
  og_image_media_asset_id     uuid,
  published_at                timestamptz,
  published_page_snapshot     jsonb,
  published_homepage_snapshot jsonb,
  scheduled_publish_at        timestamptz,
  scheduled_by                uuid,
  scheduled_revision_id       uuid,
  style_classes               jsonb,
  style_presets               jsonb,
  system_template_key         text,
  template_key                text,
  template_schema_version     integer,
  created_at                  timestamptz,
  created_by                  uuid,
  updated_at                  timestamptz,
  updated_by                  uuid
);

-- Restore the pre-migration privileges the migration exists to take away:
-- "RLS was never enabled and the default grants were never revoked, so anon
-- could SELECT, UPDATE and DELETE every row. Verified live:
-- has_table_privilege('anon', …, 'DELETE') = true." Without this the REVOKEs
-- would be no-ops and CI would not exercise the fix at all.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public._impronta_pages_backup_20260817 TO anon, authenticated;

-- PART 2 — a function the migration revokes, deleted later in the replay.
-- 20261124000000 also runs
--     revoke execute on function public.release_offering_stock(uuid, integer) …
-- and asserts on the result. That function is created by
-- 20260708190802_offering_policies_and_stock, redefined by
-- 20261229000210_offering_stock_pools, and DROPPED by
-- 20261229000215_drop_legacy_stock_rpcs. This migration is deferred (it waits
-- on the backup table above), so by the time it retries, the drop has already
-- run and it meets
--     ERROR:  function public.release_offering_stock(uuid, integer) does not exist
-- Production applied it in the window between the two, which a version-ordered
-- replay does not have.
--
-- Recreated only when 20261229000215 has already been applied — otherwise the
-- real function is still there and this is a no-op. Definition copied verbatim
-- from 20260708190802 lines 44-56. 20261124000000.post.sql drops it again
-- under the same condition, so the final schema has no trace of it, exactly
-- like production.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
              WHERE version = '20261229000215')
     AND to_regprocedure('public.release_offering_stock(uuid, integer)') IS NULL
     AND to_regclass('public.talent_offerings') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.release_offering_stock(p_offering_id uuid, p_qty int DEFAULT 1)
      RETURNS void
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path TO 'public'
      AS $body$
        UPDATE public.talent_offerings
           SET inventory_qty = inventory_qty + p_qty,
               updated_at = now()
         WHERE id = p_offering_id
           AND inventory_qty IS NOT NULL;
      $body$
    $fn$;
  END IF;
END $$;

-- Same for its sibling: 20261229000215 drops
-- `reserve_offering_stock(uuid, int)` in the same statement block, and
-- 20261124000000 revokes it in the same list. Definition copied verbatim from
-- 20260708190802 lines 15-41.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
              WHERE version = '20261229000215')
     AND to_regprocedure('public.reserve_offering_stock(uuid, integer)') IS NULL
     AND to_regclass('public.talent_offerings') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.reserve_offering_stock(p_offering_id uuid, p_qty int DEFAULT 1)
      RETURNS boolean
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO 'public'
      AS $body$
      DECLARE
        v_updated int;
      BEGIN
        IF p_qty IS NULL OR p_qty <= 0 THEN
          RETURN false;
        END IF;
        PERFORM 1 FROM public.talent_offerings
         WHERE id = p_offering_id AND inventory_qty IS NULL;
        IF FOUND THEN
          RETURN true;
        END IF;
        UPDATE public.talent_offerings
           SET inventory_qty = inventory_qty - p_qty,
               updated_at = now()
         WHERE id = p_offering_id
           AND inventory_qty >= p_qty;
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        RETURN v_updated = 1;
      END;
      $body$
    $fn$;
  END IF;
END $$;

-- PART 3 — a function production holds that no migration creates.
-- 20261124000000 revokes EXECUTE on
-- public.bootstrap_agency_taxonomy_defaults(uuid) and then asserts that anon
-- no longer holds it. Nothing in supabase/migrations/ ever creates it — the
-- only two references in the whole repo are this migration's REVOKE and its
-- assertion list — so from scratch it fails with
--     ERROR:  function public.bootstrap_agency_taxonomy_defaults(uuid) does not exist
-- Same shape as find_taxonomy_assignment_drift() (see
-- migration-shims/20260906031100.pre.sql): created out of band in production.
--
-- Recreated from the only evidence the repo holds:
-- web/src/lib/supabase/database.types.ts, generated FROM production, records
--     bootstrap_agency_taxonomy_defaults: { Args: { p_tenant_id: string },
--                                           Returns: number }
-- — one uuid argument, a numeric return. The migration's own comment says
-- "No application caller anywhere in web/src; only SECURITY DEFINER internal
-- callers", so it is SECURITY DEFINER and still carries the default PUBLIC
-- EXECUTE grant when this runs, which is what makes the REVOKE meaningful.
--
-- THE BODY IS NOT REPRODUCED AND CANNOT BE: it exists only inside production.
-- What this stand-in reproduces is the function's IDENTITY and PRIVILEGES,
-- the only things 20261124000000 touches. It returns 0. Nothing in web/src
-- calls it. If a caller is ever added, dump the real definition from
-- production and commit it as a migration instead of relying on this.
DO $$
BEGIN
  IF to_regprocedure('public.bootstrap_agency_taxonomy_defaults(uuid)') IS NULL THEN
    EXECUTE $fn$
      CREATE FUNCTION public.bootstrap_agency_taxonomy_defaults(p_tenant_id uuid)
      RETURNS integer
      LANGUAGE sql
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        -- CI stand-in: see this shim's header, PART 3.
        SELECT 0
      $body$;
    $fn$;
  END IF;
END $$;

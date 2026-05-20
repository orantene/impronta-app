-- Lift the multi-tenant blockers Lane 6's audit flagged (G3 + G7).
--
-- Background
-- ----------
-- The Phase-2b drawer wiring (`web/src/lib/site-admin/server/directory-catalogs.ts`)
-- performs per-tenant writes against two tables: `directory_sidebar_layout`
-- (full sidebar layout, one row per tenant) and `field_definitions`
-- (clone-canonical → tenant-local override on first `card_visible` /
-- `directory_filter_visible` toggle).
--
-- G3 — field_definitions per-tenant uniqueness
--   Already resolved by `20260603100000_saas_p6_agency_local_fields.sql`,
--   which dropped `field_definitions_key_key` (UNIQUE(key) global) and
--   replaced it with two partial unique indexes:
--     - `field_definitions_key_canonical_uniq` ON (key) WHERE tenant_id IS NULL
--     - `field_definitions_key_per_tenant_uniq` ON (tenant_id, key) WHERE tenant_id IS NOT NULL
--   So a clone-INSERT for (tenant_X, "ethnicity") does NOT collide with the
--   canonical (NULL, "ethnicity") row. This migration only re-asserts the
--   invariant defensively (idempotent guard) in case an older replica
--   still has the legacy single-column UNIQUE.
--
-- G7 — directory_sidebar_layout singleton CHECK
--   The legacy `20260411230000_directory_sidebar_filter_layout.sql` defined:
--     id SMALLINT PRIMARY KEY DEFAULT 1,
--     CONSTRAINT directory_sidebar_layout_singleton CHECK (id = 1)
--   `20260601200500_saas_p1_tenant_id_directory.sql` later added a
--   `tenant_id` column and backfilled all rows to tenant #1, but the
--   `id = 1` CHECK and `PRIMARY KEY (id)` were left in place. As a result
--   the first INSERT for any 2nd tenant fails with either a check_violation
--   (if `id` defaults to 1) or a primary-key conflict (if it's set to 1
--   explicitly, as the code does implicitly via the DEFAULT).
--
--   This migration removes the singleton restrictions and re-keys the
--   table on `tenant_id`, which is what every code path actually queries.
--   The `id` column is kept (nullable, for backwards-compat with any
--   admin tool that might select it), but is no longer the primary key
--   and no longer uniqueness-constrained — tenant_id takes over both
--   roles.
--
-- Blast radius
-- ------------
-- Read paths: `readDirectoryLiveCatalogSnapshot` (directory-catalogs.ts:133)
-- and `fetchDirectorySidebarLayout` (directory-sidebar-layout.ts:87) both
-- key by `tenant_id`, not `id`. No code selects `.id` from this table.
-- Write paths: `saveDirectorySidebarLayout` does UPDATE-first by tenant_id
-- then INSERT-fallback; after this migration the INSERT will succeed for
-- any 2nd tenant.

BEGIN;

-- ── G7: directory_sidebar_layout singleton lift ──────────────────────

DO $$
DECLARE
  pk_name TEXT;
BEGIN
  IF to_regclass('public.directory_sidebar_layout') IS NULL THEN
    RAISE NOTICE 'directory_sidebar_layout absent — skipping G7';
    RETURN;
  END IF;

  -- 1. Drop the CHECK (id = 1) singleton constraint (idempotent).
  ALTER TABLE public.directory_sidebar_layout
    DROP CONSTRAINT IF EXISTS directory_sidebar_layout_singleton;

  -- 2. Drop the PRIMARY KEY on id, if any. We discover the name
  --    dynamically because some environments may have a generated
  --    name (e.g. `directory_sidebar_layout_pkey`) while others may
  --    have been customised.
  SELECT conname INTO pk_name
    FROM pg_constraint
   WHERE conrelid = 'public.directory_sidebar_layout'::regclass
     AND contype = 'p';

  IF pk_name IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.directory_sidebar_layout DROP CONSTRAINT %I',
      pk_name
    );
  END IF;

  -- 3. Allow `id` to be NULL so future per-tenant INSERTs don't need
  --    to supply a value. The column stays for backwards-compat with
  --    any tooling that selects it; new rows simply have NULL.
  --    (We don't ALTER the DEFAULT — if the column still defaults to
  --    1 that's harmless now that there's no uniqueness on it.)
  BEGIN
    ALTER TABLE public.directory_sidebar_layout
      ALTER COLUMN id DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    -- Already nullable or column dropped elsewhere; ignore.
    NULL;
  END;

  -- 4. New uniqueness: one row per tenant. tenant_id was backfilled
  --    NOT NULL by 20260601200700_saas_p1_tenant_id_enforce_not_null.sql,
  --    so we can safely make it the natural key.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.directory_sidebar_layout'::regclass
       AND conname  = 'directory_sidebar_layout_tenant_pk'
  ) THEN
    ALTER TABLE public.directory_sidebar_layout
      ADD CONSTRAINT directory_sidebar_layout_tenant_pk
      PRIMARY KEY (tenant_id);
  END IF;
END $$;

COMMENT ON TABLE public.directory_sidebar_layout IS
  'Per-tenant sidebar layout (one row per agency). Primary key is tenant_id; '
  'legacy `id` column is kept nullable for backwards-compat but no longer '
  'uniqueness-bearing. Item order is `item_order` (TEXT[]) of '
  '__filter_search__ + field_definitions.key values.';

-- ── G3: field_definitions per-tenant uniqueness (defensive re-assert) ──
--
-- 20260603100000_saas_p6_agency_local_fields.sql already does this.
-- We re-run the DROP + CREATE INDEX IF NOT EXISTS so an older replica
-- (or a half-applied prior migration) still ends up with the correct
-- partial-index pair. This block is a no-op on the canonical schema.

DO $$
BEGIN
  IF to_regclass('public.field_definitions') IS NULL THEN
    RAISE NOTICE 'field_definitions absent — skipping G3';
    RETURN;
  END IF;

  -- If a legacy global UNIQUE(key) still lurks (e.g. on a stale replica),
  -- drop it. The Phase-6 migration already did this on prod, but the
  -- IF EXISTS makes the re-run safe.
  ALTER TABLE public.field_definitions
    DROP CONSTRAINT IF EXISTS field_definitions_key_key;

  -- Canonical-row uniqueness (tenant_id IS NULL).
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname  = 'field_definitions_key_canonical_uniq'
  ) THEN
    CREATE UNIQUE INDEX field_definitions_key_canonical_uniq
      ON public.field_definitions (key)
      WHERE tenant_id IS NULL;
  END IF;

  -- Per-tenant uniqueness (tenant_id IS NOT NULL).
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname  = 'field_definitions_key_per_tenant_uniq'
  ) THEN
    CREATE UNIQUE INDEX field_definitions_key_per_tenant_uniq
      ON public.field_definitions (tenant_id, key)
      WHERE tenant_id IS NOT NULL;
  END IF;
END $$;

COMMIT;

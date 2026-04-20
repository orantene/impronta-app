-- SaaS Phase 5/6 org-network extension — M0 step 7 (Option A, phone-only).
--
-- Ref: docs/saas/phase-5-6-org-network-extension.md §5.6, §6.2 step 7,
--      §A.3 (phone-based dedupe), §3.7 (why email canonicalization is
--      deferred).
--
-- What this migration does
--   1. Add `talent_profiles.phone_e164 TEXT` (nullable — populated by
--      backfill script + future app write path).
--   2. Add partial unique index on (phone_e164) where non-null and not
--      soft-deleted — the V1 dedupe primitive.
--   3. Create `phone_e164_backfill_collisions` — review table for rows
--      whose raw phone normalizes to the same E.164 as another row's.
--
-- What this migration does NOT do
--   - Does NOT add email/phone columns to `profiles` (§3.7 — deferred
--     pending email-ownership decision).
--   - Does NOT add `email_canonical` to `talent_profiles` (same reason).
--   - Does NOT run the backfill. Backfill is a separate Node script
--     (`web/scripts/backfill-talent-phone-e164.mjs`) that uses
--     `libphonenumber-js` with dry-run + apply phases.
--   - Does NOT change the app write path. Server actions begin computing
--     `phone_e164` on save in a follow-up PR after backfill completes.
--
-- Idempotent via IF NOT EXISTS. Additive (L18).

BEGIN;

-- ---------------------------------------------------------------------------
-- Step 7a — phone_e164 column on talent_profiles.
-- ---------------------------------------------------------------------------

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS phone_e164 TEXT;

COMMENT ON COLUMN public.talent_profiles.phone_e164 IS
  'Org-network extension M0 (step 7, Option A). E.164-normalized phone '
  'number. NULL when the raw phone fails libphonenumber parse OR when the '
  'row participates in a collision set pending super-admin review (see '
  'phone_e164_backfill_collisions). Dedupe primitive for §A.3 phone-based '
  'rules; unique partial index below ignores NULLs and soft-deleted rows.';

-- ---------------------------------------------------------------------------
-- Step 7b — partial unique index.
--
-- Scope: excludes NULL and excludes soft-deleted rows. A restored row
-- (deleted_at cleared) would have its phone_e164 re-enter the uniqueness
-- scope; that is the intended behavior — restoring a talent reasserts
-- their phone-based identity.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS talent_profiles_phone_e164_uk
  ON public.talent_profiles (phone_e164)
  WHERE phone_e164 IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.talent_profiles_phone_e164_uk IS
  'Org-network extension M0 (step 7). Partial unique — ignores NULL and '
  'soft-deleted rows so collision-set members can coexist with NULL '
  'phone_e164 while awaiting review.';

-- ---------------------------------------------------------------------------
-- Step 7c — phone_e164_backfill_collisions review table.
--
-- Populated by the backfill script when >=2 rows normalize to the same
-- E.164. Each row in a collision set is written as a separate row here
-- (not a group row) so resolution actions are per-row.
--
-- Not RLS-scoped to a tenant: collisions are cross-tenant by nature (a
-- phone lives on talent_profiles, which is global / canonical). Access is
-- restricted to platform admins via is_platform_admin().
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.phone_e164_backfill_collisions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id              UUID        NOT NULL
                                    REFERENCES public.talent_profiles(id)
                                    ON DELETE CASCADE,
  raw_phone           TEXT        NOT NULL,
  computed_e164       TEXT        NOT NULL,
  detected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at         TIMESTAMPTZ,
  resolver_id         UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution_action   TEXT
                        CHECK (resolution_action IN
                          ('claim','distinct','merge_candidate','deferred')),
  resolution_notes    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT phone_e164_backfill_collisions_raw_nonempty
    CHECK (char_length(trim(raw_phone)) > 0),
  CONSTRAINT phone_e164_backfill_collisions_e164_format
    CHECK (computed_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  CONSTRAINT phone_e164_backfill_collisions_resolution_consistency
    CHECK (
      (resolved_at IS NULL AND resolution_action IS NULL)
      OR (resolved_at IS NOT NULL AND resolution_action IS NOT NULL)
    )
);

-- A single row may collide under more than one candidate (e.g. if the
-- backfill re-runs after a phone edit). Allow multiple collision rows per
-- talent, but dedupe so the same (row, computed) pair isn't logged twice
-- per open collision.
CREATE UNIQUE INDEX IF NOT EXISTS phone_e164_backfill_collisions_open_unique
  ON public.phone_e164_backfill_collisions (row_id, computed_e164)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS phone_e164_backfill_collisions_computed_idx
  ON public.phone_e164_backfill_collisions (computed_e164)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS phone_e164_backfill_collisions_detected_idx
  ON public.phone_e164_backfill_collisions (detected_at DESC)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE public.phone_e164_backfill_collisions IS
  'Org-network extension M0 (step 7). Review queue for rows whose raw '
  'phone normalized to a shared E.164 during backfill. Each row in a '
  'collision set is logged here with phone_e164 left NULL on '
  'talent_profiles until super-admin review. Resolution actions: '
  '''claim'' (this row wins the phone), ''distinct'' (legitimately '
  'different person, suppress warnings 180d), ''merge_candidate'' (feeds '
  'into §A.3 human-review queue), ''deferred'' (decide later).';

ALTER TABLE public.phone_e164_backfill_collisions ENABLE ROW LEVEL SECURITY;

-- Platform admins only. The helper `is_platform_admin()` exists in prior
-- migrations and gates platform-global surfaces.
DROP POLICY IF EXISTS phone_e164_backfill_collisions_platform_all
  ON public.phone_e164_backfill_collisions;
CREATE POLICY phone_e164_backfill_collisions_platform_all
  ON public.phone_e164_backfill_collisions
  FOR ALL
  USING       (public.is_platform_admin())
  WITH CHECK  (public.is_platform_admin());

-- updated_at autoupdate — reuse the shared touch function if one exists,
-- otherwise define locally. The 20260601100400 convention uses per-table
-- functions; we match that here to avoid coupling to a shared helper.
CREATE OR REPLACE FUNCTION public.phone_e164_backfill_collisions_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_phone_e164_backfill_collisions_touch_updated_at
  ON public.phone_e164_backfill_collisions;
CREATE TRIGGER trg_phone_e164_backfill_collisions_touch_updated_at
  BEFORE UPDATE ON public.phone_e164_backfill_collisions
  FOR EACH ROW EXECUTE FUNCTION public.phone_e164_backfill_collisions_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Validation — schema objects exist; index is valid; column is nullable.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'talent_profiles'
       AND column_name  = 'phone_e164'
       AND is_nullable  = 'YES'
  ) THEN
    RAISE EXCEPTION 'M0 step-7 validation: talent_profiles.phone_e164 missing or NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'talent_profiles'
       AND indexname  = 'talent_profiles_phone_e164_uk'
  ) THEN
    RAISE EXCEPTION 'M0 step-7 validation: talent_profiles_phone_e164_uk index missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name   = 'phone_e164_backfill_collisions'
  ) THEN
    RAISE EXCEPTION 'M0 step-7 validation: phone_e164_backfill_collisions table missing';
  END IF;
END
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- Rollback reference:
-- ---------------------------------------------------------------------------
--
-- BEGIN;
--   DROP TRIGGER IF EXISTS trg_phone_e164_backfill_collisions_touch_updated_at
--     ON public.phone_e164_backfill_collisions;
--   DROP FUNCTION IF EXISTS public.phone_e164_backfill_collisions_touch_updated_at();
--   DROP TABLE IF EXISTS public.phone_e164_backfill_collisions;
--   DROP INDEX IF EXISTS public.talent_profiles_phone_e164_uk;
--   ALTER TABLE public.talent_profiles DROP COLUMN IF EXISTS phone_e164;
-- COMMIT;

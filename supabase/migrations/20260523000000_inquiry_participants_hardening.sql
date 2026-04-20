-- Hardening migration for `inquiry_participants`.
--
-- This migration only ADDS guardrails. It does not modify or drop anything.
-- After this runs, the table enforces role/field invariants at the DB level,
-- prevents multiple active clients per inquiry, keeps `updated_at` honest,
-- and serves the talent-dashboard lookups without extra scans.
--
-- Idempotent: everything is `IF NOT EXISTS` / `DO $$ … $$` so it can be
-- re-applied safely in CI and against any environment.

-- 1) CHECK constraints for role ↔ required reference invariants ───────────
-- role='talent'       ⇒ talent_profile_id IS NOT NULL
-- role='client'       ⇒ user_id            IS NOT NULL
-- role='coordinator'  ⇒ user_id            IS NOT NULL
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inquiry_participants_role_talent_requires_profile'
  ) THEN
    ALTER TABLE public.inquiry_participants
      ADD CONSTRAINT inquiry_participants_role_talent_requires_profile
      CHECK (role <> 'talent' OR talent_profile_id IS NOT NULL) NOT VALID;
    -- Validate separately so a single bad historical row does not block the
    -- rest of the migration; we call VALIDATE after cleanup in a follow-up.
    BEGIN
      ALTER TABLE public.inquiry_participants
        VALIDATE CONSTRAINT inquiry_participants_role_talent_requires_profile;
    EXCEPTION WHEN check_violation THEN
      RAISE WARNING
        'inquiry_participants_role_talent_requires_profile left NOT VALID — existing rows violate it. Clean up before re-running VALIDATE CONSTRAINT.';
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inquiry_participants_role_client_requires_user'
  ) THEN
    ALTER TABLE public.inquiry_participants
      ADD CONSTRAINT inquiry_participants_role_client_requires_user
      CHECK (role <> 'client' OR user_id IS NOT NULL) NOT VALID;
    BEGIN
      ALTER TABLE public.inquiry_participants
        VALIDATE CONSTRAINT inquiry_participants_role_client_requires_user;
    EXCEPTION WHEN check_violation THEN
      RAISE WARNING
        'inquiry_participants_role_client_requires_user left NOT VALID — existing rows violate it.';
    END;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inquiry_participants_role_coordinator_requires_user'
  ) THEN
    ALTER TABLE public.inquiry_participants
      ADD CONSTRAINT inquiry_participants_role_coordinator_requires_user
      CHECK (role <> 'coordinator' OR user_id IS NOT NULL) NOT VALID;
    BEGIN
      ALTER TABLE public.inquiry_participants
        VALIDATE CONSTRAINT inquiry_participants_role_coordinator_requires_user;
    EXCEPTION WHEN check_violation THEN
      RAISE WARNING
        'inquiry_participants_role_coordinator_requires_user left NOT VALID — existing rows violate it.';
    END;
  END IF;
END $$;

-- 2) Partial unique index: one active client per inquiry ──────────────────
CREATE UNIQUE INDEX IF NOT EXISTS inquiry_participants_one_active_client
  ON public.inquiry_participants (inquiry_id)
  WHERE role = 'client' AND status = 'active';

-- 3) Index to serve talent-dashboard lookups ──────────────────────────────
-- talent-notifications.ts: .eq('talent_profile_id', tp.id).eq('role', 'talent')
CREATE INDEX IF NOT EXISTS idx_participants_talent_profile_role
  ON public.inquiry_participants (talent_profile_id, role)
  WHERE talent_profile_id IS NOT NULL;

-- 4) Keep updated_at honest ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inquiry_participants_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_inquiry_participants_set_updated_at'
      AND tgrelid = 'public.inquiry_participants'::regclass
  ) THEN
    CREATE TRIGGER trg_inquiry_participants_set_updated_at
    BEFORE UPDATE ON public.inquiry_participants
    FOR EACH ROW
    EXECUTE FUNCTION public.inquiry_participants_set_updated_at();
  END IF;
END $$;

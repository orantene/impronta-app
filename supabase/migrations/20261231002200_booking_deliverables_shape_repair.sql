-- Projects (P4) — make `booking_deliverables` the table its own migration says
-- it is.
--
-- WHAT IS WRONG. `20261230000400_booking_deliverables.sql` creates the table
-- with eleven columns: booking_id, title, kind, status, revision,
-- revision_limit, due_at, notes and the timestamps. On the isolated journeys
-- branch the table exists with THREE — id, tenant_id and the
-- `selected_asset_ids` that `20261230000600` added afterwards. So 000400's
-- CREATE TABLE did not run its column list, 000600's ALTER found a table to
-- attach to, and the ledger records both versions as applied.
--
-- WHY THIS MATTERS BEYOND THIS SLICE. `lib/bookings/deliverables.ts` is the
-- approval and revision engine — createDeliverable, submitDeliverable,
-- approveDeliverable, requestRevision — and every one of its statements names
-- columns that are not there. Its unit tests pass against a fake client, so no
-- lane could see it. The first thing to touch the real table is the Projects
-- milestones screen, which is how it surfaced.
--
-- THE SHAPE IS COPIED FROM 20261230000400, WITH TWO ADDED DEFAULTS. Every
-- column name, type and CHECK below is that file's. Two things below are NOT in
-- it and are named here rather than passed off as a restatement:
--
--     kind    text NOT NULL DEFAULT 'service'
--     status  text NOT NULL DEFAULT 'draft'
--
-- 000400 declares both NOT NULL with no default, which a CREATE TABLE can do
-- and an ADD COLUMN on a table that already has rows cannot: every existing row
-- needs a value at the moment the column appears. The two defaults are the
-- values `createDeliverable` in `lib/bookings/deliverables.ts` writes anyway
-- ('service' unless a passthrough budget is asked for, and 'draft' always), so
-- a row that arrives through the engine is unaffected and one that predates the
-- column lands in the same state a new deliverable does. On a database where
-- 000400 took effect this file adds nothing: ADD COLUMN IF NOT EXISTS skips the
-- column, and the default is not applied to a column that already exists.
--
-- ADDITIVE AND IDEMPOTENT. Columns are added with a default where one is
-- possible and only then tightened, and each tightening is guarded on there
-- being no row that would violate it — a NOT NULL that cannot be satisfied
-- should leave the column nullable and the table usable, not abort the
-- migration.
--
-- APPLY: `npm run journeys:repair -- supabase/migrations/20261231002200_booking_deliverables_shape_repair.sql`
-- against the ISOLATED branch. Never `npm run db:push`.

BEGIN;

ALTER TABLE public.booking_deliverables
  ADD COLUMN IF NOT EXISTS booking_id     uuid REFERENCES public.agency_bookings(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS title          text,
  ADD COLUMN IF NOT EXISTS kind           text NOT NULL DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS status         text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS revision       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revision_limit integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS due_at         timestamptz,
  ADD COLUMN IF NOT EXISTS notes          text,
  ADD COLUMN IF NOT EXISTS created_at     timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

-- `title` cannot carry a default (a deliverable called 'service' would be
-- worse than one that is refused), so it is tightened only when every existing
-- row already has one.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.booking_deliverables WHERE title IS NULL) THEN
    ALTER TABLE public.booking_deliverables ALTER COLUMN title SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.booking_deliverables WHERE booking_id IS NULL) THEN
    ALTER TABLE public.booking_deliverables ALTER COLUMN booking_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.booking_deliverables WHERE tenant_id IS NULL) THEN
    ALTER TABLE public.booking_deliverables ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

ALTER TABLE public.booking_deliverables
  DROP CONSTRAINT IF EXISTS booking_deliverables_kind_check;
ALTER TABLE public.booking_deliverables
  ADD CONSTRAINT booking_deliverables_kind_check
  CHECK (kind IN ('service', 'passthrough_budget'));

ALTER TABLE public.booking_deliverables
  DROP CONSTRAINT IF EXISTS booking_deliverables_status_check;
ALTER TABLE public.booking_deliverables
  ADD CONSTRAINT booking_deliverables_status_check
  CHECK (status IN ('draft', 'submitted', 'approved', 'revision_requested', 'cancelled'));

ALTER TABLE public.booking_deliverables
  DROP CONSTRAINT IF EXISTS booking_deliverables_revision_check;
ALTER TABLE public.booking_deliverables
  ADD CONSTRAINT booking_deliverables_revision_check
  CHECK (revision >= 0);

ALTER TABLE public.booking_deliverables
  DROP CONSTRAINT IF EXISTS booking_deliverables_revision_limit_check;
ALTER TABLE public.booking_deliverables
  ADD CONSTRAINT booking_deliverables_revision_limit_check
  CHECK (revision_limit >= 0);

CREATE INDEX IF NOT EXISTS booking_deliverables_booking_idx
  ON public.booking_deliverables (booking_id, status);

CREATE INDEX IF NOT EXISTS booking_deliverables_tenant_idx
  ON public.booking_deliverables (tenant_id, due_at);

COMMENT ON TABLE public.booking_deliverables IS
  'Work the client accepts. Revision rounds are counted here. passthrough_budget is not a service fee.';

-- The grants and policies from 000400, restated for the same reason: if that
-- file's CREATE TABLE did not take, its REVOKE/GRANT block may not have either.
ALTER TABLE public.booking_deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_deliverables FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_deliverables_select_staff ON public.booking_deliverables;
CREATE POLICY booking_deliverables_select_staff ON public.booking_deliverables
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.booking_deliverables FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.booking_deliverables FROM anon;

GRANT SELECT ON TABLE public.booking_deliverables TO authenticated;
GRANT ALL ON TABLE public.booking_deliverables TO service_role;

COMMIT;

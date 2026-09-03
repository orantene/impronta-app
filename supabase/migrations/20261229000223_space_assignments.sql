-- Spaces & Seating S3 — which place a party is actually sitting in.
--
-- WHY THIS IS A TABLE AND NOT A COLUMN ON capacity_allocations
-- Two reasons, and the second is the one that settles it.
--
-- 1. LAYERING. An allocation is the Capacity Engine Manager's row: N units of a
--    pool over a window. WHICH TABLE a guest is seated at is a Spaces fact, and
--    adding a column to someone else's table to store my fact inverts the
--    dependency — the engine would carry a concept it has no use for.
--
-- 2. A JOINED PARTY SITS AT TWO TABLES. "T7 and T8 join for a party of six" is
--    one allocation occupying two spaces, and a single `space_id` column cannot
--    say that. It is not a normalisation preference; the shape is genuinely
--    one-to-many, and a column would have forced a second allocation for the
--    same guests — which is the double-count this whole area exists to prevent.
--
-- UNASSIGNED IS A VALID STATE, so the absence of a row here is meaningful and
-- not an error: a reservation exists before the host decides where to put it,
-- and the host stand's whole job is the list of parties with no row yet.
--
-- WHY NO OVERLAP CONSTRAINT HERE
-- The window lives on the allocation, not on this row, so a database exclusion
-- constraint would need it denormalised — two sources for one fact, free to
-- disagree. Overlap is decided by `decideAssignment` (rule 6) against the
-- allocations themselves, and the capacity engine refuses the reserve underneath
-- regardless. Storing the window again to enforce it here would buy a guarantee
-- we already have and a way to be wrong that we do not currently have.
--
-- Rollback: drop the table. Nothing references it.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.

BEGIN;

CREATE TABLE IF NOT EXISTS public.space_assignments (
  allocation_id UUID NOT NULL
    REFERENCES public.capacity_allocations(id) ON DELETE CASCADE,
  space_id      UUID NOT NULL
    REFERENCES public.spaces(id) ON DELETE RESTRICT,
  tenant_id     UUID NOT NULL
    REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- The party this seating is for, copied at assign time. It is on the ORDER in
  -- the general case, but the host stand needs it to render a list without
  -- joining through to money, and a moved party keeps the size it arrived with.
  party_size    INTEGER CHECK (party_size IS NULL OR party_size >= 1),

  -- True for the second and later spaces of a joined seating, so the host list
  -- can show "T8 (joined)" rather than implying a party of six is at two
  -- separate tables.
  is_join       BOOLEAN NOT NULL DEFAULT false,

  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  PRIMARY KEY (allocation_id, space_id)
);

COMMENT ON TABLE public.space_assignments IS
  'Spaces & Seating S3: which space(s) an allocation is seated at. One allocation can occupy several spaces (joined tables), which is why this is a table and not a column on capacity_allocations. Absence of a row means unassigned, which is a valid state.';

CREATE INDEX IF NOT EXISTS idx_space_assignments_space
  ON public.space_assignments (space_id);
CREATE INDEX IF NOT EXISTS idx_space_assignments_tenant
  ON public.space_assignments (tenant_id);

-- Same-tenant integrity across three tables, which a CHECK cannot see.
CREATE OR REPLACE FUNCTION public.space_assignments_verify_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.spaces WHERE id = NEW.space_id;
  IF v_tenant IS NULL OR v_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'space_assignments: space belongs to another tenant'
      USING ERRCODE = 'SP020';
  END IF;

  SELECT tenant_id INTO v_tenant FROM public.capacity_allocations WHERE id = NEW.allocation_id;
  IF v_tenant IS NULL OR v_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'space_assignments: allocation belongs to another tenant'
      USING ERRCODE = 'SP021';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS space_assignments_verify_tenant_biu ON public.space_assignments;
CREATE TRIGGER space_assignments_verify_tenant_biu
  BEFORE INSERT OR UPDATE ON public.space_assignments
  FOR EACH ROW EXECUTE FUNCTION public.space_assignments_verify_tenant();

ALTER TABLE public.space_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS space_assignments_select_staff ON public.space_assignments;
CREATE POLICY space_assignments_select_staff ON public.space_assignments
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

GRANT SELECT ON TABLE public.space_assignments TO authenticated;
GRANT ALL    ON TABLE public.space_assignments TO service_role;

REVOKE ALL ON FUNCTION public.space_assignments_verify_tenant()
  FROM PUBLIC, anon, authenticated;

COMMIT;

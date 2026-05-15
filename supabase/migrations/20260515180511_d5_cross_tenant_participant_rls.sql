-- D5 — Cross-tenant fan-out, slice 1: tighten admin RLS on
-- inquiry_participants so staff of agency X can no longer see talent
-- rows whose owning_party_id is agency Y on the same inquiry.
--
-- Before D5, every active inquiry was single-tenant — inquiry.tenant_id
-- equals every participant's owning_party_id. The existing policy
-- `inquiry_participants_tenant_staff USING is_staff_of_tenant(tenant_id)`
-- was correct for that world. With Discover-originated inquiries (path 6),
-- a single inquiry can resolve to multiple owning parties (agency Milan,
-- agency Berlin, independent talent), each frozen on the participant row.
-- We now scope each talent row by its OWN owning party — not the inquiry's.
--
-- Non-talent rows (client, coordinator) keep tenant_id scoping because
-- they don't have an owning_party — they belong to the inquiry-level
-- relationship, not a per-talent routing decision.
--
-- Single-tenant inquiries are unaffected: when owning_party_type =
-- 'workspace' and owning_party_id = tenant_id, the new check
-- `is_staff_of_tenant(owning_party_id)` returns the same result as
-- `is_staff_of_tenant(tenant_id)`. Verified by the D0 trigger which
-- defaults talent rows to ('workspace', tenant_id).
--
-- See:
--   - web/docs/discover-and-unified-inquiry-2026-05-14.md §3.3 (thread fan-out)
--   - supabase/migrations/20260922130000_inquiry_participants_owning_party.sql (D0)
--   - project_discover_unified.md §3.3, §3.7

BEGIN;

-- ─── 1. Drop the legacy P2 policy that scopes everything on tenant_id ─────
-- (Phase 2 RLS migration replaced inquiry_participants_staff with
-- inquiry_participants_tenant_staff. Now we split by role.)
DROP POLICY IF EXISTS inquiry_participants_tenant_staff ON public.inquiry_participants;

-- ─── 2. Non-talent rows — keep tenant_id scoping ─────────────────────────
-- Client + coordinator rows belong to the inquiry-level relationship.
-- They aren't per-talent routing decisions, so they stay on the
-- inquiry's tenant. Inserts + reads + updates all gated this way.
CREATE POLICY inquiry_participants_nontalent_tenant_staff
  ON public.inquiry_participants
  FOR ALL
  USING (
    role <> 'talent'
    AND public.is_staff_of_tenant(tenant_id)
  )
  WITH CHECK (
    role <> 'talent'
    AND public.is_staff_of_tenant(tenant_id)
  );

-- ─── 3. Talent rows — scope on owning_party_id ───────────────────────────
-- For talent rows, the owning_party_id is the routing destination
-- frozen at submit time (D0). Staff of the owning_party tenant can
-- read + manage the row. Independent-talent rows (owning_party_type
-- = 'talent') intentionally have no staff visibility — they route
-- direct to the talent's own inbox, not to any workspace inbox.
CREATE POLICY inquiry_participants_talent_owning_party_staff
  ON public.inquiry_participants
  FOR ALL
  USING (
    role = 'talent'
    AND owning_party_type IN ('agency', 'workspace')
    AND public.is_staff_of_tenant(owning_party_id)
  )
  WITH CHECK (
    role = 'talent'
    AND owning_party_type IN ('agency', 'workspace')
    AND public.is_staff_of_tenant(owning_party_id)
  );

-- ─── 4. Talent rows with NULL owning_party — back-compat fallback ────────
-- Rows inserted before D0 + back-fill that somehow escaped the trigger.
-- Default to inquiry tenant_id scoping so admins on the inquiry's tenant
-- can still read them. This policy is the long tail; the trigger
-- defaults every new insert so the path is effectively dead going
-- forward.
CREATE POLICY inquiry_participants_talent_legacy_tenant_staff
  ON public.inquiry_participants
  FOR ALL
  USING (
    role = 'talent'
    AND owning_party_type IS NULL
    AND public.is_staff_of_tenant(tenant_id)
  )
  WITH CHECK (
    role = 'talent'
    AND owning_party_type IS NULL
    AND public.is_staff_of_tenant(tenant_id)
  );

-- ─── 5. Helper: is_cross_tenant_inquiry(inquiry_id) ──────────────────────
-- Returns true when the inquiry's talent participants resolve to more
-- than one distinct owning_party_id. Useful for:
--   * Surfacing "Cross-tenant" badges on admin shell
--   * Conditional client UI that bundles per-tenant status pills
--   * Auditing the routing decision after submit
CREATE OR REPLACE FUNCTION public.is_cross_tenant_inquiry(p_inquiry_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT COUNT(DISTINCT owning_party_id)
    FROM public.inquiry_participants
    WHERE inquiry_id = p_inquiry_id
      AND role = 'talent'
      AND owning_party_id IS NOT NULL
  ) > 1;
$$;

COMMENT ON FUNCTION public.is_cross_tenant_inquiry IS
  'True when the inquiry has talents routed to multiple owning parties (D5). Used by admin shell to surface cross-tenant context badges + per-party rollups.';

-- ─── 6. Helper: owning_parties_for_inquiry(inquiry_id) ───────────────────
-- Returns one row per distinct owning party with its type, id, and a
-- count of talent participants. Used by loaders that need to render the
-- per-tenant status rollup ("2 talents · Agency Milan · pending").
CREATE OR REPLACE FUNCTION public.owning_parties_for_inquiry(p_inquiry_id UUID)
RETURNS TABLE (
  owning_party_type TEXT,
  owning_party_id UUID,
  talent_count INT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    owning_party_type,
    owning_party_id,
    COUNT(*)::INT AS talent_count
  FROM public.inquiry_participants
  WHERE inquiry_id = p_inquiry_id
    AND role = 'talent'
    AND owning_party_id IS NOT NULL
  GROUP BY owning_party_type, owning_party_id
  ORDER BY owning_party_type, owning_party_id;
$$;

COMMENT ON FUNCTION public.owning_parties_for_inquiry IS
  'Per-owning-party rollup of talent participants on an inquiry. Used by D5 admin + client UI for cross-tenant status rendering.';

-- Grant execute to authenticated callers — both helpers are SECURITY
-- DEFINER so they bypass RLS internally but the calling user still
-- needs row visibility to act on the result.
GRANT EXECUTE ON FUNCTION public.is_cross_tenant_inquiry(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owning_parties_for_inquiry(UUID) TO authenticated;

COMMIT;

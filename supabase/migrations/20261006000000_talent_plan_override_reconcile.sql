-- Talent plan-override expiry reconcile
-- =============================================================================
-- Mirror of public.reconcile_expired_plan_overrides (workspace) for the TALENT
-- side. Without this, an expired talent_plan_overrides row never flips status
-- and talent_profiles.talent_plan_key keeps the elevated (trial/comp) plan
-- forever — so a lapsed Pro/Max trial would never degrade the talent page.
--
-- For every active talent override whose expires_at has passed it:
--   • restores talent_profiles.talent_plan_key — to a live paid talent
--     subscription's plan if one exists, else to the base_plan_key snapshot;
--   • marks the override row 'expired'.
--
-- "Return to base UNLESS a live paid subscription exists" — a talent who pays
-- for Pro and was comped to Max drops back to Pro, not to a stale base snapshot.
--
-- SECURITY DEFINER so it can be called from any context (the public talent page
-- read path calls it for self-healing). Idempotent — a no-op when nothing has
-- expired. Pass a talent_profile_id to scope it, or NULL to sweep all.
--
-- Additive only — one new function. No table or row changes.

BEGIN;

CREATE OR REPLACE FUNCTION public.reconcile_expired_talent_plan_overrides(
  p_talent_profile_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec         RECORD;
  reconciled  INTEGER := 0;
  restore_key TEXT;
BEGIN
  FOR rec IN
    SELECT * FROM public.talent_plan_overrides
     WHERE status = 'active'
       AND expires_at IS NOT NULL
       AND expires_at <= now()
       AND (p_talent_profile_id IS NULL OR talent_profile_id = p_talent_profile_id)
  LOOP
    -- Prefer a live paid subscription over the (possibly stale) base snapshot.
    SELECT plan_key INTO restore_key
      FROM public.talent_subscriptions
     WHERE talent_profile_id = rec.talent_profile_id
       AND status IN ('active', 'trialing', 'past_due')
     ORDER BY updated_at DESC
     LIMIT 1;

    IF restore_key IS NULL THEN
      restore_key := rec.base_plan_key;
    END IF;

    UPDATE public.talent_profiles
       SET talent_plan_key = restore_key,
           updated_at = now()
     WHERE id = rec.talent_profile_id;

    UPDATE public.talent_plan_overrides
       SET status = 'expired',
           ended_at = now()
     WHERE id = rec.id;

    reconciled := reconciled + 1;
  END LOOP;

  RETURN reconciled;
END;
$$;

COMMENT ON FUNCTION public.reconcile_expired_talent_plan_overrides(UUID) IS
  'Reverts talent profiles whose plan override has expired (returns to base plan, or to a live paid talent subscription if one exists) and marks the override row expired. Safe to call from any context — SECURITY DEFINER, idempotent. Returns the count reconciled.';

GRANT EXECUTE ON FUNCTION public.reconcile_expired_talent_plan_overrides(UUID)
  TO authenticated, service_role;

COMMIT;

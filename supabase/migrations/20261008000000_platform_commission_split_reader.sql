-- P4 — expose the platform client/seller commission split to the engine.
--
-- The commission resolver splits the platform take into a CLIENT SURCHARGE +
-- a SELLER DEDUCTION. The split ratio lives in
-- platform_commission_config.client_surcharge_bps (platform-admin controlled,
-- added in 20261007000000). The per-participant context RPC
-- (engine_load_commission_context) does not carry it, so rather than
-- reproduce that 130-line function we add a tiny SECURITY DEFINER reader the
-- commission engine calls to fetch the split and inject it into the resolver
-- input. NULL → the resolver applies an even split (its built-in default).
--
-- SECURITY DEFINER bypasses platform_commission_config's admin-only read RLS,
-- exactly like engine_load_commission_context already does for the rest of the
-- platform config.

BEGIN;

CREATE OR REPLACE FUNCTION public.engine_platform_commission_split()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT client_surcharge_bps
  FROM public.platform_commission_config
  WHERE singleton_key = TRUE;
$$;

REVOKE ALL ON FUNCTION public.engine_platform_commission_split() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_platform_commission_split() TO authenticated;

COMMENT ON FUNCTION public.engine_platform_commission_split() IS
  'Returns platform_commission_config.client_surcharge_bps — the client-side share of the platform take, in bps. SECURITY DEFINER bypasses the admin-only read RLS so the commission engine can apply the admin-set client/seller split. NULL = even split (resolver default).';

COMMIT;

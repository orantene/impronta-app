-- Batch workspace_service_listing_is_sellable (p_listing_ids uuid[]).
--
-- HELD in _pending_pm. Additive and idempotent: one new function (an overload of the single-id
-- function from 20261231419300, #4159). Nothing existing changes.
--
-- Why: the public hub and roster readers (#4171, #4177) ask "is this listing sellable?" once per
-- listing per page load. This answers for many listings in ONE round trip.
--
-- It reuses the single-id function row by row, so the rule exists in exactly one place and the
-- two can never disagree. Returns the ids that are sellable (a subset of the ids passed in);
-- an id that does not exist, is not accepted, or fails any check is simply not returned. Callers
-- treat an error or a missing function as "nothing is sellable" (fail closed).
--
-- Bounded: at most 500 ids per call (raises 54000 above that, so a bug cannot turn one call into
-- an unbounded scan). Service role only: the readers use the service role client; the browser
-- never calls it.
--
-- Applies AFTER 20261231419300 (it raises if the single-id function is missing so the order
-- cannot be got wrong silently).
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.workspace_service_listing_is_sellable(uuid[]);

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.workspace_service_listing_is_sellable(uuid)') IS NULL THEN
    RAISE EXCEPTION 'apply 20261231419300 (workspace_service_listing_is_sellable) first' USING ERRCODE = '55000';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.workspace_service_listing_is_sellable(p_listing_ids uuid[])
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out uuid[];
BEGIN
  IF p_listing_ids IS NULL OR cardinality(p_listing_ids) = 0 THEN
    RETURN ARRAY[]::uuid[];
  END IF;
  IF cardinality(p_listing_ids) > 500 THEN
    RAISE EXCEPTION 'too many listing ids' USING ERRCODE = '54000';
  END IF;

  SELECT COALESCE(array_agg(i.id ORDER BY i.ord), ARRAY[]::uuid[])
    INTO v_out
    FROM (
      SELECT DISTINCT ON (u.id) u.id, u.ord
        FROM unnest(p_listing_ids) WITH ORDINALITY AS u(id, ord)
       WHERE u.id IS NOT NULL
       ORDER BY u.id, u.ord
    ) i
   WHERE public.workspace_service_listing_is_sellable(i.id);

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.workspace_service_listing_is_sellable(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_service_listing_is_sellable(uuid[]) TO service_role;

COMMENT ON FUNCTION public.workspace_service_listing_is_sellable(uuid[]) IS
  'Batch form of workspace_service_listing_is_sellable(uuid): returns the sellable ids among at most 500. Reuses the single-id rule row by row. Service role only.';

COMMIT;

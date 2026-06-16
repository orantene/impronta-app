-- Drop the now-unused coordinator_join_requests feature.
--
-- The talent-initiated coordinator-join flow was superseded by the
-- admin-appoints-a-talent flow (PR #434). Its UI (CoordRequestSheet) was
-- removed in PR #450 and its server actions + lib (coord-request-actions.ts,
-- coordinator-join-requests.ts) in PR #453 — leaving this table, its trigger,
-- its dedicated trigger function, and 6 SECURITY DEFINER RPCs as dead schema
-- with zero callers. The table had 0 rows. No other table has a FK referencing
-- it, so the drop has no cascade impact on live data.
--
-- ORDER MATTERS: the table's RLS policy `coord_request_select` depends on
-- coord_request_can_approve(), so DROP TABLE ... CASCADE must run FIRST (it
-- removes the table's policies, trigger, indexes, and FK constraints). Only then
-- can the functions be dropped — the trigger function is no longer referenced by
-- the (now-gone) trigger, and can_approve is no longer referenced by the
-- (now-gone) policy. coord_request_touch_updated_at is dedicated to this table's
-- trigger (named coord_request_*, used by no other trigger), so dropping it is
-- safe.

BEGIN;

DROP TABLE IF EXISTS public.coordinator_join_requests CASCADE;

DROP FUNCTION IF EXISTS public.coord_request_can_approve(uuid, uuid);
DROP FUNCTION IF EXISTS public.coord_request_submit(uuid, text);
DROP FUNCTION IF EXISTS public.coord_request_approve(uuid);
DROP FUNCTION IF EXISTS public.coord_request_decline(uuid, text);
DROP FUNCTION IF EXISTS public.coord_request_cancel(uuid);
DROP FUNCTION IF EXISTS public.coord_request_revoke(uuid, text);
DROP FUNCTION IF EXISTS public.coord_request_touch_updated_at();

COMMIT;

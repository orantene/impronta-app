-- Phase 2 · E1b — the draft-only delete rule, enforced instead of documented.
--
-- E1 shipped the rule in `lib/events/event-policy.ts:canHardDelete` and said in
-- its own migration that a `BEFORE DELETE` trigger was rejected because
-- `events.tenant_id` cascades from `agencies`, so the trigger would fire on
-- every row of a tenant being deleted and block tenant deletion entirely.
--
-- THAT REASON WAS WRONG, and the Platform Features Director found the
-- counter-precedent: `agency_domains_block_subdomain_delete`
-- (`20260601100200:50-68`) solves it with one line. The guard asks whether the
-- PARENT STILL EXISTS. During a cascade from `agencies` the parent row is
-- already gone by the time the child's BEFORE DELETE fires, so the guard skips
-- itself; a direct delete while the tenant is alive still raises.
--
-- I DID NOT TAKE THAT ON THE PRECEDENT'S WORD, because the precedent's own
-- comment calls it "simplest check" and its cascade branch may never have run:
-- it only executes when a whole tenant is deleted, which is rare enough that a
-- broken version of it would have sat there looking correct. This platform has
-- a recorded lesson about exactly that -- a repair path that only runs after the
-- failure it repairs has never been executed. So the mechanism was proven on
-- throwaway tables first: a protected child refused a direct delete
-- (direct_refused = true) AND a parent delete cascaded straight through the
-- guard (cascade_succeeded = true, child_rows_left = 0).
--
-- WHY THE TRIGGER IS WORTH HAVING NOW THAT IT IS FREE. The app-layer check
-- protects the delete PATH. It does not protect the table from a maintenance
-- script, a service-role job, or a hand-run statement -- and what is being
-- protected is the record of what people bought. A rule whose only enforcement
-- is the code path everyone is asked to use is a convention; this makes it an
-- invariant. `canHardDelete` stays as the surface that gives a usable error
-- before the attempt, rather than being replaced by this.

BEGIN;

CREATE OR REPLACE FUNCTION public.events_block_destructive_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE sold int;
BEGIN
  -- The carve-out, and the whole reason this trigger can exist. Absent parent
  -- means we are inside a CASCADE from `agencies`: deleting a workspace must
  -- not be blocked by the events inside it.
  IF NOT EXISTS (SELECT 1 FROM public.agencies a WHERE a.id = OLD.tenant_id) THEN
    RETURN OLD;
  END IF;

  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION
      'event % is %, not draft: cancel it instead. Deleting it would strand its sessions at '
      'status=scheduled, which the anon policy on `sessions` publishes -- a removed show''s '
      'nights left on sale, belonging to nothing.',
      OLD.id, OLD.status
      USING ERRCODE = '23503';
  END IF;

  SELECT count(*) INTO sold
    FROM public.admissions ad
    JOIN public.sessions s ON s.id = ad.session_id
   WHERE s.event_id = OLD.id;

  IF sold > 0 THEN
    RAISE EXCEPTION
      'event % has % admission(s): it is history, not a draft. Cancel and refund by policy.',
      OLD.id, sold
      USING ERRCODE = '23503';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_block_destructive_delete ON public.events;
CREATE TRIGGER trg_events_block_destructive_delete
  BEFORE DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_block_destructive_delete();

COMMENT ON FUNCTION public.events_block_destructive_delete() IS
  'Only a draft event with zero admissions may be hard-deleted. Skips itself during a CASCADE '
  'from agencies (parent already gone), so deleting a workspace is never blocked. Mechanism '
  'proven empirically, not inferred from the agency_domains precedent it copies.';

COMMIT;

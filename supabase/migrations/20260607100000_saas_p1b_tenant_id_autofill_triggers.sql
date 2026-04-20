-- SaaS Phase 1.B hardening — tenant_id autofill + mismatch guard triggers.
--
-- Ref: STEP 1 hardening directive — "Fix all broken tenant_id writes".
--      Plan §4.5 (tenant invariants), §4 (ownership), L37 (fail-hard).
--
-- Problem: B8 enforces NOT NULL on tenant_id for every operational table, but
-- many insert paths (both engine RPCs written pre-SaaS and TS helpers) do not
-- set tenant_id. Rewriting every INSERT is large, risky, and leaves future
-- callers exposed to the same bug.
--
-- Approach: BEFORE INSERT trigger on each child table that
--   1. If NEW.tenant_id IS NULL, copy it from the parent row
--      (inquiries / agency_bookings / inquiry_offers) referenced by the FK.
--   2. If NEW.tenant_id IS NOT NULL AND parent.tenant_id IS NOT NULL AND
--      they differ → RAISE — defence in depth against cross-tenant writes.
--
-- Parent tables (`inquiries`, `agency_bookings`) keep their NOT NULL contract:
-- callers MUST supply tenant_id explicitly. There is no safe autofill source
-- for a brand-new root row.
--
-- This migration adds NO columns and changes NO data. It is a pure write-time
-- invariant layer.

BEGIN;

-- ── Helper: shared trigger-function builder ────────────────────────────────
-- One function per table (so DROP / re-CREATE is idempotent without tangling
-- signatures). Each reads the parent's tenant_id via a primary-key lookup.

-- ── inquiry_participants ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tenant_autofill_inquiry_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tid UUID;
BEGIN
  SELECT tenant_id INTO parent_tid FROM public.inquiries WHERE id = NEW.inquiry_id;
  IF parent_tid IS NULL THEN
    RAISE EXCEPTION 'tenant_autofill: parent inquiry % has no tenant_id', NEW.inquiry_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tid;
  ELSIF NEW.tenant_id <> parent_tid THEN
    RAISE EXCEPTION 'tenant_autofill: inquiry_participants.tenant_id % does not match parent inquiry tenant %', NEW.tenant_id, parent_tid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_inquiry_participants ON public.inquiry_participants;
CREATE TRIGGER trg_tenant_autofill_inquiry_participants
  BEFORE INSERT ON public.inquiry_participants
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_inquiry_participants();

-- ── inquiry_messages ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tenant_autofill_inquiry_messages()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tid UUID;
BEGIN
  SELECT tenant_id INTO parent_tid FROM public.inquiries WHERE id = NEW.inquiry_id;
  IF parent_tid IS NULL THEN
    RAISE EXCEPTION 'tenant_autofill: parent inquiry % has no tenant_id', NEW.inquiry_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tid;
  ELSIF NEW.tenant_id <> parent_tid THEN
    RAISE EXCEPTION 'tenant_autofill: inquiry_messages.tenant_id mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_inquiry_messages ON public.inquiry_messages;
CREATE TRIGGER trg_tenant_autofill_inquiry_messages
  BEFORE INSERT ON public.inquiry_messages
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_inquiry_messages();

-- ── inquiry_message_reads ───────────────────────────────────────────────────
DO $$ BEGIN
  IF to_regclass('public.inquiry_message_reads') IS NOT NULL THEN
    EXECUTE $trg$
      CREATE OR REPLACE FUNCTION public.tenant_autofill_inquiry_message_reads()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $fn$
      DECLARE
        parent_tid UUID;
      BEGIN
        SELECT tenant_id INTO parent_tid FROM public.inquiries WHERE id = NEW.inquiry_id;
        IF parent_tid IS NULL THEN
          RAISE EXCEPTION 'tenant_autofill: parent inquiry % has no tenant_id', NEW.inquiry_id;
        END IF;
        IF NEW.tenant_id IS NULL THEN
          NEW.tenant_id := parent_tid;
        ELSIF NEW.tenant_id <> parent_tid THEN
          RAISE EXCEPTION 'tenant_autofill: inquiry_message_reads.tenant_id mismatch';
        END IF;
        RETURN NEW;
      END;
      $fn$;
    $trg$;
    EXECUTE 'DROP TRIGGER IF EXISTS trg_tenant_autofill_inquiry_message_reads ON public.inquiry_message_reads';
    EXECUTE 'CREATE TRIGGER trg_tenant_autofill_inquiry_message_reads BEFORE INSERT ON public.inquiry_message_reads FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_inquiry_message_reads()';
  END IF;
END $$;

-- ── inquiry_offers ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tenant_autofill_inquiry_offers()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tid UUID;
BEGIN
  SELECT tenant_id INTO parent_tid FROM public.inquiries WHERE id = NEW.inquiry_id;
  IF parent_tid IS NULL THEN
    RAISE EXCEPTION 'tenant_autofill: parent inquiry % has no tenant_id', NEW.inquiry_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tid;
  ELSIF NEW.tenant_id <> parent_tid THEN
    RAISE EXCEPTION 'tenant_autofill: inquiry_offers.tenant_id mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_inquiry_offers ON public.inquiry_offers;
CREATE TRIGGER trg_tenant_autofill_inquiry_offers
  BEFORE INSERT ON public.inquiry_offers
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_inquiry_offers();

-- ── inquiry_offer_line_items (parent is inquiry_offers) ─────────────────────
CREATE OR REPLACE FUNCTION public.tenant_autofill_inquiry_offer_line_items()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tid UUID;
BEGIN
  SELECT tenant_id INTO parent_tid FROM public.inquiry_offers WHERE id = NEW.offer_id;
  IF parent_tid IS NULL THEN
    RAISE EXCEPTION 'tenant_autofill: parent inquiry_offer % has no tenant_id', NEW.offer_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tid;
  ELSIF NEW.tenant_id <> parent_tid THEN
    RAISE EXCEPTION 'tenant_autofill: inquiry_offer_line_items.tenant_id mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_inquiry_offer_line_items ON public.inquiry_offer_line_items;
CREATE TRIGGER trg_tenant_autofill_inquiry_offer_line_items
  BEFORE INSERT ON public.inquiry_offer_line_items
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_inquiry_offer_line_items();

-- ── inquiry_approvals ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tenant_autofill_inquiry_approvals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tid UUID;
BEGIN
  SELECT tenant_id INTO parent_tid FROM public.inquiries WHERE id = NEW.inquiry_id;
  IF parent_tid IS NULL THEN
    RAISE EXCEPTION 'tenant_autofill: parent inquiry % has no tenant_id', NEW.inquiry_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tid;
  ELSIF NEW.tenant_id <> parent_tid THEN
    RAISE EXCEPTION 'tenant_autofill: inquiry_approvals.tenant_id mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_inquiry_approvals ON public.inquiry_approvals;
CREATE TRIGGER trg_tenant_autofill_inquiry_approvals
  BEFORE INSERT ON public.inquiry_approvals
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_inquiry_approvals();

-- ── inquiry_events ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tenant_autofill_inquiry_events()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tid UUID;
BEGIN
  SELECT tenant_id INTO parent_tid FROM public.inquiries WHERE id = NEW.inquiry_id;
  IF parent_tid IS NULL THEN
    RAISE EXCEPTION 'tenant_autofill: parent inquiry % has no tenant_id', NEW.inquiry_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tid;
  ELSIF NEW.tenant_id <> parent_tid THEN
    RAISE EXCEPTION 'tenant_autofill: inquiry_events.tenant_id mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_inquiry_events ON public.inquiry_events;
CREATE TRIGGER trg_tenant_autofill_inquiry_events
  BEFORE INSERT ON public.inquiry_events
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_inquiry_events();

-- ── inquiry_action_log ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tenant_autofill_inquiry_action_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tid UUID;
BEGIN
  SELECT tenant_id INTO parent_tid FROM public.inquiries WHERE id = NEW.inquiry_id;
  IF parent_tid IS NULL THEN
    RAISE EXCEPTION 'tenant_autofill: parent inquiry % has no tenant_id', NEW.inquiry_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tid;
  ELSIF NEW.tenant_id <> parent_tid THEN
    RAISE EXCEPTION 'tenant_autofill: inquiry_action_log.tenant_id mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_inquiry_action_log ON public.inquiry_action_log;
CREATE TRIGGER trg_tenant_autofill_inquiry_action_log
  BEFORE INSERT ON public.inquiry_action_log
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_inquiry_action_log();

-- ── inquiry_requirement_groups ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tenant_autofill_inquiry_requirement_groups()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tid UUID;
BEGIN
  SELECT tenant_id INTO parent_tid FROM public.inquiries WHERE id = NEW.inquiry_id;
  IF parent_tid IS NULL THEN
    RAISE EXCEPTION 'tenant_autofill: parent inquiry % has no tenant_id', NEW.inquiry_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tid;
  ELSIF NEW.tenant_id <> parent_tid THEN
    RAISE EXCEPTION 'tenant_autofill: inquiry_requirement_groups.tenant_id mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_inquiry_requirement_groups ON public.inquiry_requirement_groups;
CREATE TRIGGER trg_tenant_autofill_inquiry_requirement_groups
  BEFORE INSERT ON public.inquiry_requirement_groups
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_inquiry_requirement_groups();

-- ── inquiry_coordinators ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tenant_autofill_inquiry_coordinators()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tid UUID;
BEGIN
  SELECT tenant_id INTO parent_tid FROM public.inquiries WHERE id = NEW.inquiry_id;
  IF parent_tid IS NULL THEN
    RAISE EXCEPTION 'tenant_autofill: parent inquiry % has no tenant_id', NEW.inquiry_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tid;
  ELSIF NEW.tenant_id <> parent_tid THEN
    RAISE EXCEPTION 'tenant_autofill: inquiry_coordinators.tenant_id mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_inquiry_coordinators ON public.inquiry_coordinators;
CREATE TRIGGER trg_tenant_autofill_inquiry_coordinators
  BEFORE INSERT ON public.inquiry_coordinators
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_inquiry_coordinators();

-- ── failed_engine_effects ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tenant_autofill_failed_engine_effects()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tid UUID;
BEGIN
  SELECT tenant_id INTO parent_tid FROM public.inquiries WHERE id = NEW.inquiry_id;
  IF parent_tid IS NULL THEN
    RAISE EXCEPTION 'tenant_autofill: parent inquiry % has no tenant_id', NEW.inquiry_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tid;
  ELSIF NEW.tenant_id <> parent_tid THEN
    RAISE EXCEPTION 'tenant_autofill: failed_engine_effects.tenant_id mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_failed_engine_effects ON public.failed_engine_effects;
CREATE TRIGGER trg_tenant_autofill_failed_engine_effects
  BEFORE INSERT ON public.failed_engine_effects
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_failed_engine_effects();

-- ── booking_talent (parent is agency_bookings) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.tenant_autofill_booking_talent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tid UUID;
BEGIN
  SELECT tenant_id INTO parent_tid FROM public.agency_bookings WHERE id = NEW.booking_id;
  IF parent_tid IS NULL THEN
    RAISE EXCEPTION 'tenant_autofill: parent booking % has no tenant_id', NEW.booking_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tid;
  ELSIF NEW.tenant_id <> parent_tid THEN
    RAISE EXCEPTION 'tenant_autofill: booking_talent.tenant_id mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_booking_talent ON public.booking_talent;
CREATE TRIGGER trg_tenant_autofill_booking_talent
  BEFORE INSERT ON public.booking_talent
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_booking_talent();

-- ── booking_activity_log (parent is agency_bookings) ────────────────────────
CREATE OR REPLACE FUNCTION public.tenant_autofill_booking_activity_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tid UUID;
BEGIN
  SELECT tenant_id INTO parent_tid FROM public.agency_bookings WHERE id = NEW.booking_id;
  IF parent_tid IS NULL THEN
    RAISE EXCEPTION 'tenant_autofill: parent booking % has no tenant_id', NEW.booking_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tid;
  ELSIF NEW.tenant_id <> parent_tid THEN
    RAISE EXCEPTION 'tenant_autofill: booking_activity_log.tenant_id mismatch';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_booking_activity_log ON public.booking_activity_log;
CREATE TRIGGER trg_tenant_autofill_booking_activity_log
  BEFORE INSERT ON public.booking_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_booking_activity_log();

-- ── agency_bookings self-derive from source_inquiry_id when possible ───────
-- Parent table has no autofill source for manual bookings, but inquiry-converted
-- bookings can safely inherit from the source inquiry. Prevents the engine RPC
-- path from having to duplicate the lookup. Mismatch still raises.
CREATE OR REPLACE FUNCTION public.tenant_autofill_agency_bookings()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tid UUID;
BEGIN
  IF NEW.source_inquiry_id IS NOT NULL THEN
    SELECT tenant_id INTO parent_tid FROM public.inquiries WHERE id = NEW.source_inquiry_id;
    IF parent_tid IS NOT NULL THEN
      IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := parent_tid;
      ELSIF NEW.tenant_id <> parent_tid THEN
        RAISE EXCEPTION 'tenant_autofill: agency_bookings.tenant_id % does not match source inquiry tenant %', NEW.tenant_id, parent_tid;
      END IF;
    END IF;
  END IF;
  -- NOT NULL is still enforced by the column constraint from B8 for manual
  -- bookings (no source inquiry) — TS callers must supply tenant_id.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_agency_bookings ON public.agency_bookings;
CREATE TRIGGER trg_tenant_autofill_agency_bookings
  BEFORE INSERT ON public.agency_bookings
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_agency_bookings();

COMMIT;

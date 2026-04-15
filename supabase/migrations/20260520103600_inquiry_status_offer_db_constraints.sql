-- Inquiry workspace: DB-level status ↔ current offer pairing + single "active" offer row per inquiry.
-- Runs after inquiry_offers / inquiry_offer_status exist (see 20260520103000_phase2_inquiry_offers_approvals.sql).
-- Idempotent: safe to re-run.

BEGIN;

DROP INDEX IF EXISTS public.inquiry_offers_one_live_commercial;

CREATE UNIQUE INDEX IF NOT EXISTS inquiry_offers_one_active_offer
  ON public.inquiry_offers (inquiry_id)
  WHERE status IN ('draft', 'sent', 'accepted');

CREATE OR REPLACE FUNCTION public.enforce_inquiry_status_offer_pair()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  offer_st public.inquiry_offer_status;
  st text;
BEGIN
  IF TG_TABLE_NAME <> 'inquiries' THEN
    RETURN NEW;
  END IF;

  st := NEW.status::text;

  IF NEW.current_offer_id IS NULL THEN
    IF st IN ('offer_pending', 'approved', 'booked', 'converted') THEN
      RAISE EXCEPTION 'inquiry status % is incompatible with NULL current_offer_id', st;
    END IF;
    RETURN NEW;
  END IF;

  SELECT o.status INTO offer_st
  FROM public.inquiry_offers o
  WHERE o.id = NEW.current_offer_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF offer_st = 'superseded'::public.inquiry_offer_status THEN
    RETURN NEW;
  END IF;

  IF offer_st = 'draft'::public.inquiry_offer_status THEN
    IF st NOT IN (
      'reviewing', 'coordination', 'in_progress', 'waiting_for_client', 'talent_suggested'
    ) THEN
      RAISE EXCEPTION 'draft offer incompatible with inquiry status %', st;
    END IF;
    RETURN NEW;
  END IF;

  IF offer_st = 'sent'::public.inquiry_offer_status THEN
    IF st <> 'offer_pending' THEN
      RAISE EXCEPTION 'sent offer requires inquiry status offer_pending, got %', st;
    END IF;
    RETURN NEW;
  END IF;

  IF offer_st = 'accepted'::public.inquiry_offer_status THEN
    IF st NOT IN ('approved', 'booked', 'converted') THEN
      RAISE EXCEPTION 'accepted offer incompatible with inquiry status %', st;
    END IF;
    RETURN NEW;
  END IF;

  IF offer_st = 'rejected'::public.inquiry_offer_status THEN
    IF st NOT IN (
      'reviewing', 'coordination', 'in_progress', 'waiting_for_client', 'talent_suggested'
    ) THEN
      RAISE EXCEPTION 'rejected offer incompatible with inquiry status %', st;
    END IF;
    RETURN NEW;
  END IF;

  IF offer_st = 'invalidated'::public.inquiry_offer_status THEN
    IF st NOT IN (
      'reviewing', 'coordination', 'in_progress', 'waiting_for_client', 'talent_suggested',
      'offer_pending', 'closed_lost'
    ) THEN
      RAISE EXCEPTION 'invalidated offer incompatible with inquiry status %', st;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inquiries_status_offer_pair ON public.inquiries;
CREATE TRIGGER trg_inquiries_status_offer_pair
  BEFORE INSERT OR UPDATE OF status, current_offer_id
  ON public.inquiries
  FOR EACH ROW
  EXECUTE PROCEDURE public.enforce_inquiry_status_offer_pair();

COMMIT;

-- Phase 2 · E0 — `admissions`: one row per unit that arrives.
--
-- WHY THIS TABLE, AND WHY EVENTS OWNS IT. Ticketing is orders plus admissions
-- plus a door; the first two are shipped. Sessions & Classes needs it for P1.4
-- and Reservations needs it for the host stand, so parking it behind either of
-- them blocks two areas to spare one. Events writes it; Sessions keeps the
-- check-in RPC and the token format that sit on top of it.
--
-- ONE ROW PER UNIT THAT ARRIVES, not per unit sold. A ticket line for four is
-- FOUR admissions, one QR each, each admitting one person. A table reservation
-- for four is ONE admission admitting four, because a host stand showing four
-- rows for one party is wrong. `party_size` is what each row admits.
--
-- WHAT IS DELIBERATELY ABSENT:
--   * No `qr_token`. The token is a derived HMAC over `admission:v<n>:<id>`,
--     following `lib/notifications/guest-unsubscribe-token.ts`. A stored token
--     is a credential at rest in a table a door role reads; a derived one
--     cannot leak from a row. `<n>` is `token_version` below.
--   * No `checked_in` state. "Has the guest arrived" and "is this
--     commercially good" are independent facts, and one label holding both is
--     this repo's recorded `one label, three states` incident. Arrival is
--     `admitted_count`; the commercial fact is `status`.
--   * No anon RLS policy. Holder names and emails are here. The public receipt
--     reads through a definer function keyed on the token, never through a
--     table grant.

BEGIN;

CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS public.admissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- ── The four anchors ─────────────────────────────────────────────────────
  --
  -- ALL NULLABLE, ON PURPOSE, AND THIS WAS SETTLED THE HARD WAY. `allocation_id`
  -- was ruled NOT NULL on the grounds that "every admission has an allocation by
  -- construction". Those two words were doing the whole argument's work and were
  -- false: an uncapped RSVP has no pool, `set_offering_stock(NULL)` deactivates
  -- the pool AND clears the subject's `capacity_pool_id`, and if nothing can
  -- refuse there is no capacity object to point at. A NOT NULL here would have
  -- been satisfied by a placeholder allocation against a dummy pool, which makes
  -- the column lie rather than the constraint hold.
  --
  -- ON DELETE SET NULL on all four, for the reason `orders.inquiry_id` has it:
  -- losing the thing that produced the record must never destroy the record that
  -- someone was admitted.
  allocation_id  uuid REFERENCES public.capacity_allocations(id) ON DELETE SET NULL,
  order_line_id  uuid REFERENCES public.order_lines(id)          ON DELETE SET NULL,
  session_id     uuid REFERENCES public.sessions(id)             ON DELETE SET NULL,
  space_id       uuid REFERENCES public.spaces(id)               ON DELETE SET NULL,

  -- ── Who it is for ────────────────────────────────────────────────────────
  --
  -- THE HOLDER, NEVER THE BUYER. The buyer is `orders.customer_id`. Six seats
  -- bought by one person are six admissions, six holders, one order, one buyer,
  -- and six QRs on one receipt. Ratified by Sessions & Classes.
  customer_id    uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  holder_name    text,
  holder_email   public.citext,

  -- The host stand's entire query is today's book ordered by time, so the time
  -- lives on the row rather than behind a join through two nullable anchors.
  starts_at      timestamptz,

  -- ── Commercial state, independent of arrival ─────────────────────────────
  --
  -- 'refunded' is a denormalisation of a fact `order_lines` owns, kept because
  -- the door needs a one-row read to say "refunded" rather than "invalid".
  -- ITS CONDITION: refund-by-line must be the SOLE writer of it. If anything
  -- else can refund without stamping here, the door admits a refunded ticket
  -- and nothing detects the disagreement.
  status         text NOT NULL DEFAULT 'valid'
                   CHECK (status IN ('valid','void','refunded')),

  -- ── Arrival ──────────────────────────────────────────────────────────────
  --
  -- HOW MANY PEOPLE THIS ROW ADMITS, and the ONLY count the door asks for. Not
  -- how much capacity was consumed: those are different questions and the second
  -- is already answered by the allocation and by `consumes_units` on the variant.
  --
  -- A SECOND COLUMN (`units`, for the capacity side) WAS PROPOSED BY ME AND
  -- REFUSED, and the refutation came out of this feature's own headline tier.
  -- A "VIP table for 6" is ONE allocation of 1 unit (one table out of the VIP
  -- group) admitting SIX people. Had both columns shipped, `units` would be 1,
  -- and `CHECK (admitted_count <= units)` would have capped a six-person table
  -- at one guest through the door. The two counts are equal in every case anyone
  -- could name and differ in GRAIN the moment they diverge, under names that do
  -- not say so - which is the exact shape of the `unit_price` / `talent_cost`
  -- commission P0 this platform fixed two days ago. One count, named for the
  -- question the door actually asks.
  party_size     int NOT NULL DEFAULT 1 CHECK (party_size > 0),
  admitted_count int NOT NULL DEFAULT 0,

  -- Inside the operation rather than in whichever caller remembered: this is
  -- what stops a double scan writing 3 of 2 into the database.
  CONSTRAINT admissions_admitted_within_party
    CHECK (admitted_count >= 0 AND admitted_count <= party_size),

  -- In the HMAC input, so a re-issue kills every prior QR WITHOUT voiding the
  -- row. `status='void'` revokes the admission; a transfer or a resend must
  -- revoke the TOKEN and keep the seat, and void-and-remint would detach the row
  -- from its allocation and lose what was sold. A counter, not a credential.
  token_version  smallint NOT NULL DEFAULT 1 CHECK (token_version > 0),

  -- ── Door and floor stamps, never derived from a count ────────────────────
  --
  -- `no_show_at` is a positive call by a human. Absence of arrivals is not the
  -- same fact as "did not show", which is the same label-collapse the `status`
  -- split above rejects.
  seated_at      timestamptz,
  no_show_at     timestamptz,
  completed_at   timestamptz,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  -- ── The anchor guard ─────────────────────────────────────────────────────
  --
  -- A DELIBERATELY WEAK GUARD. Reading DOWN the five legitimate cases, each of
  -- the four columns is absent in at least one of them, so no single column can
  -- be the anchor:
  --
  --   case                                        alloc  session  space  line
  --   1 class seat or ticket, capped                yes    yes      -     yes
  --   2 comp or guest list on a capped session      yes    yes      -     NO
  --   3 uncapped RSVP or free registration          NO     yes      -     yes
  --   4 band reservation before the host seats it   yes    -        NO    yes
  --   5 walk-in against the same pool               yes    -      later   NO
  --
  -- A STRONGER GUARD WAS CONSIDERED AND REFUSED.
  -- `session_id IS NOT NULL OR allocation_id IS NOT NULL` holds on all five and
  -- is strictly stronger. It is not used, because this table has already had a
  -- strong guard refuse a real case TWICE: `session_id OR space_id` refused
  -- every band reservation, and `allocation_id NOT NULL` refused case 3. A table
  -- with two refuted strong guards has told you its shape is not yet known, and
  -- the answer there is enumeration plus a test rather than a third guess.
  --
  -- The five cases are pinned by `admissions-anchor.test.ts`, so a sixth case is
  -- a visible edit to this comment and that test rather than a silent widening.
  CONSTRAINT admissions_anchored
    CHECK (num_nonnulls(allocation_id, session_id, space_id, order_line_id) >= 1)
);

-- ── Indexes ────────────────────────────────────────────────────────────────

-- The door: every valid admission for one session, which is the scan lookup and
-- the door list. Partial on status so voided and refunded rows never enter it.
CREATE INDEX IF NOT EXISTS admissions_session_valid_idx
  ON public.admissions (session_id) WHERE session_id IS NOT NULL AND status = 'valid';

-- The host stand: today's book by time.
CREATE INDEX IF NOT EXISTS admissions_tenant_starts_idx
  ON public.admissions (tenant_id, starts_at) WHERE starts_at IS NOT NULL;

-- Refund by line reads this: refunding one line must void exactly its admissions.
CREATE INDEX IF NOT EXISTS admissions_order_line_idx
  ON public.admissions (order_line_id) WHERE order_line_id IS NOT NULL;

-- Attendance history per customer, and "who came to the last one".
CREATE INDEX IF NOT EXISTS admissions_customer_idx
  ON public.admissions (customer_id, created_at DESC) WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS admissions_space_idx
  ON public.admissions (space_id) WHERE space_id IS NOT NULL;

-- ── RLS ────────────────────────────────────────────────────────────────────
--
-- Same shape as `sessions`: staff read, service-role writes only, no anon.
-- NO PUBLIC POLICY, deliberately. `sessions` grants anon SELECT because a
-- schedule is public; an admission carries a holder's name and email and is not.
-- The receipt reads its own admissions through a definer function keyed on the
-- derived token.

ALTER TABLE public.admissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admissions_select_staff ON public.admissions;
CREATE POLICY admissions_select_staff ON public.admissions
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

REVOKE ALL ON TABLE public.admissions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.admissions TO authenticated;

-- ── Touch trigger ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admissions_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admissions_touch_trg ON public.admissions;
CREATE TRIGGER admissions_touch_trg
  BEFORE UPDATE ON public.admissions
  FOR EACH ROW EXECUTE FUNCTION public.admissions_touch();

-- ── Comments ───────────────────────────────────────────────────────────────

COMMENT ON TABLE public.admissions IS
  'One row per unit that arrives: a ticket, a class seat, a table reservation, a walk-in. '
  'Written by the purchase pipeline and the door; never by hand.';
COMMENT ON COLUMN public.admissions.party_size IS
  'How many PEOPLE this one admission admits, and the only count the door asks for. Not capacity '
  'consumed: a VIP table for 6 is one allocation of 1 unit admitting 6. The capacity side is the '
  'allocation''s job; a second count column here would differ in grain under a name that hides it.';
COMMENT ON COLUMN public.admissions.admitted_count IS
  'How many of `party_size` have come through the door. "Checked in" is derived (admitted_count > 0), '
  'never stored, because arrival and commercial validity are independent facts.';
COMMENT ON COLUMN public.admissions.token_version IS
  'The <n> in the derived HMAC `admission:v<n>:<id>`. Bumping it kills every prior QR while the '
  'admission keeps its identity, its allocation and its sold history. Never a secret.';
COMMENT ON COLUMN public.admissions.status IS
  'Commercial validity only. `refunded` is denormalised from order_lines so the door can read one '
  'row; refund-by-line MUST be its sole writer.';
COMMENT ON COLUMN public.admissions.customer_id IS
  'The HOLDER of this admission, not the buyer. The buyer is orders.customer_id.';

COMMIT;

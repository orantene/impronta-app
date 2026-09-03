-- Phase 0.5 — `orders` and `order_lines`: the purchase, separate from the conversation.
--
-- WHY. Every dollar on the platform currently moves through one shape:
-- inquiry → offer → approval → convert → booking → commission snapshot →
-- transaction → transfer. That is right for a quoted job and absurd for a taco.
-- The menu order engine has to force-write the inquiry status twice under the
-- service role to get through a state machine built for something else, re-reads
-- versions five times, and stamps starts_at = ends_at = now() as a calendar
-- placeholder because a taco has no call time.
--
-- An order is the commercial record. It can exist without a conversation, and a
-- conversation can hold several of them (deposit, balance, add-ons).
--
-- THIS MIGRATION ADDS ONLY. Nothing reads these tables yet; the convert RPC
-- starts writing them in the next file and the commission context starts reading
-- them in the one after. Expand, then contract.
--
-- CENTS. Every amount here is an integer of the order's currency's minor unit.
-- The upstream quoted path is NUMERIC major units (`inquiry_offers.total_client_price`,
-- `inquiry_offer_line_items.unit_price`), and it stays that way until the quoted
-- path is migrated. Conversion happens at exactly one boundary, in
-- `public.offer_major_to_cents(numeric)`, introduced with the commission context
-- change so both the order path and the offer path round identically. A second
-- rounding implementation is a per-line ±1c drift that only shows up after real
-- money has moved.

BEGIN;

CREATE TYPE public.order_status AS ENUM (
  'draft',              -- a cart, or a quote staff are still building
  'quoted',             -- sent to the client, awaiting their acceptance
  'pending_payment',    -- capacity held, TTL running, Stripe session live
  'paid',
  'fulfilled',
  'cancelled',
  'refunded',
  'partially_refunded'
);

CREATE TABLE public.orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,

  -- Optional. A menu order has no conversation until someone writes; a quoted
  -- job has one from the start. ON DELETE SET NULL because losing the thread
  -- must never destroy the record of a payment.
  inquiry_id          UUID REFERENCES public.inquiries(id) ON DELETE SET NULL,

  status              public.order_status NOT NULL DEFAULT 'draft',

  -- Optimistic concurrency, same shape the inquiry engine uses. Every
  -- transition writes `WHERE version = :expected` so a lost update returns a
  -- conflict instead of silently winning.
  version             INTEGER NOT NULL DEFAULT 1,

  currency            TEXT NOT NULL DEFAULT 'USD',
  subtotal_cents      BIGINT NOT NULL DEFAULT 0,
  discount_cents      BIGINT NOT NULL DEFAULT 0,
  -- Placeholder, deliberately. Ships empty and stays empty until a tax adviser
  -- states the Mexico IVA rule. The column exists now so the rule does not need
  -- a migration when it arrives.
  tax_cents           BIGINT NOT NULL DEFAULT 0,
  total_cents         BIGINT NOT NULL DEFAULT 0,

  source_channel      TEXT NOT NULL,   -- 'menu' | 'instant_book' | 'offer' | ...
  source_page         TEXT,

  -- Owned by other managers; typed now, constrained when their tables land.
  -- Spaces & Seating adds the FK for space_id (S2); Sessions & Classes for
  -- session_id (Phase 1). Declaring them here keeps their migrations additive.
  space_id            UUID,
  session_id          UUID,

  payout_release_rule TEXT NOT NULL DEFAULT 'immediate'
    CHECK (payout_release_rule IN ('immediate','on_fulfilment','on_session_end')),

  -- Set while a payment is in flight. The reaper cancels the order and releases
  -- capacity past this. Minutes, not the 48 hours the reservation path uses.
  hold_expires_at     TIMESTAMPTZ,

  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT orders_amounts_nonneg CHECK (
    subtotal_cents >= 0 AND discount_cents >= 0 AND tax_cents >= 0 AND total_cents >= 0),
  CONSTRAINT orders_total_is_derived CHECK (
    total_cents = subtotal_cents - discount_cents + tax_cents),
  CONSTRAINT orders_currency_shape CHECK (currency ~ '^[A-Z]{3}$')
);

CREATE INDEX orders_tenant_status_idx ON public.orders (tenant_id, status, created_at DESC);
CREATE INDEX orders_customer_idx      ON public.orders (customer_id, created_at DESC);
CREATE INDEX orders_inquiry_idx       ON public.orders (inquiry_id) WHERE inquiry_id IS NOT NULL;
CREATE INDEX orders_hold_expiry_idx   ON public.orders (hold_expires_at)
  WHERE status = 'pending_payment' AND hold_expires_at IS NOT NULL;

COMMENT ON TABLE public.orders IS
  'The commercial record. May exist with no inquiry; one inquiry may hold many orders '
  '(deposit, balance, add-ons). Money is integer cents.';
COMMENT ON COLUMN public.orders.tax_cents IS
  'Placeholder. Always 0 until a tax adviser states the rule. The column exists so the rule does not need a migration.';

CREATE TABLE public.order_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  tenant_id         UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- Nullable: a staff-added ad-hoc line ("late night surcharge") references no
  -- catalog row, and `inquiry_offer_line_items.source_service_id` is TEXT rather
  -- than a uuid FK, so a converted line may carry a value that no longer
  -- resolves. Dropping the pointer is correct; failing the conversion is not.
  offering_id       UUID REFERENCES public.talent_offerings(id) ON DELETE SET NULL,
  variant_id        UUID REFERENCES public.talent_offering_variants(id) ON DELETE SET NULL,
  addon_ids         UUID[] NOT NULL DEFAULT '{}',

  label             TEXT NOT NULL,
  units             NUMERIC(12,3) NOT NULL DEFAULT 1 CHECK (units > 0),
  unit_cents        BIGINT NOT NULL CHECK (unit_cents >= 0),
  total_cents       BIGINT NOT NULL CHECK (total_cents >= 0),
  tax_cents         BIGINT NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),

  -- The payee XOR, copied verbatim from `inquiry_offer_line_items` rather than
  -- redesigned: exactly one of a talent (their lane) or a tenant (the house
  -- lane). The commission resolver already understands this shape.
  talent_profile_id UUID REFERENCES public.talent_profiles(id) ON DELETE SET NULL,
  owner_tenant_id   UUID REFERENCES public.agencies(id) ON DELETE SET NULL,

  -- What the payee receives per unit. Without this the commission resolver
  -- cannot be fed from order lines at all, which is the entire point of 0.5.
  talent_cost_cents BIGINT NOT NULL DEFAULT 0 CHECK (talent_cost_cents >= 0),

  -- Capacity allocations this line holds. Deliberately NO foreign key: the
  -- Capacity Engine's tables land in 0.2, and orders must not wait for them.
  -- Their commit/release RPCs take this array; nothing here changes when 0.2
  -- arrives.
  allocation_ids    UUID[] NOT NULL DEFAULT '{}',

  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT order_lines_payee_xor
    CHECK (num_nonnulls(talent_profile_id, owner_tenant_id) = 1)
);

CREATE INDEX order_lines_order_idx  ON public.order_lines (order_id, sort_order);
CREATE INDEX order_lines_talent_idx ON public.order_lines (talent_profile_id) WHERE talent_profile_id IS NOT NULL;

COMMENT ON COLUMN public.order_lines.allocation_ids IS
  'Capacity allocation ids. No FK on purpose: capacity_allocations lands in 0.2 and orders must not block on it.';

-- ─────────────────────────────────────────────────────────────────────────────
-- order_id on the money spine. Nullable through the whole transition; nothing
-- requires it until Phase 1.
--
-- The three unique indexes that enforce one booking = one buyer = one charge
-- (idx_booking_transactions_booking_active, inquiry_offers_one_live_commercial,
-- booking_payouts_unique_leg) are deliberately NOT touched. Nothing in Phase 0
-- needs many buyers per booking, and relaxing a guard before its replacement
-- exists is how the many-buyers case becomes a data-integrity incident instead
-- of a feature. Events designs that relaxation with Orders in Phase 2.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.booking_transactions
  ADD COLUMN order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;
ALTER TABLE public.booking_commission_snapshot
  ADD COLUMN order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;
ALTER TABLE public.agency_bookings
  ADD COLUMN order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE INDEX booking_transactions_order_idx        ON public.booking_transactions (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX booking_commission_snapshot_order_idx ON public.booking_commission_snapshot (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX agency_bookings_order_idx             ON public.agency_bookings (order_id) WHERE order_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- updated_at + customer roll-ups
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orders_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_touch BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_touch_updated_at();

REVOKE ALL ON FUNCTION public.orders_touch_updated_at() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.orders_touch_updated_at() FROM anon, authenticated;

-- 0.4 shipped `recompute_customer_rollups` guarded on `orders` not existing yet.
-- It exists now, so re-create without the guard and wire the trigger.
CREATE OR REPLACE FUNCTION public.recompute_customer_rollups(p_customer_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.customers c
     SET visits       = COALESCE(o.visits, 0),
         spend_cents  = COALESCE(o.spend_cents, 0),
         last_seen_at = GREATEST(c.last_seen_at, o.last_seen_at)
    FROM (
      SELECT count(*) FILTER (
               WHERE status IN ('paid','fulfilled','partially_refunded')
             ) AS visits,
             -- Gross of what was actually charged. Refund deduction lands in
             -- 0.8b, when refund rows exist to deduct.
             COALESCE(sum(total_cents) FILTER (
               WHERE status IN ('paid','fulfilled','partially_refunded')
             ), 0) AS spend_cents,
             max(created_at) AS last_seen_at
        FROM public.orders
       WHERE customer_id = p_customer_id
    ) o
   WHERE c.id = p_customer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_customer_rollups(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recompute_customer_rollups(UUID) FROM anon, authenticated;

-- Recompute, never increment: an incremental counter drifts the first time a
-- webhook redelivers a status transition, and this platform's webhooks retry.
CREATE OR REPLACE FUNCTION public.orders_refresh_customer_rollups()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    PERFORM public.recompute_customer_rollups(OLD.customer_id);
  END IF;
  PERFORM public.recompute_customer_rollups(COALESCE(NEW.customer_id, OLD.customer_id));
  RETURN NULL;
END;
$$;

CREATE TRIGGER orders_rollups_aiud
  AFTER INSERT OR DELETE OR UPDATE OF status, total_cents, customer_id ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_refresh_customer_rollups();

REVOKE ALL ON FUNCTION public.orders_refresh_customer_rollups() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.orders_refresh_customer_rollups() FROM anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS. Staff of the tenant read; the buying customer reads their own; every
-- write goes through the service role in the purchase pipeline.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders      FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_lines FORCE  ROW LEVEL SECURITY;

CREATE POLICY orders_staff_select ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());

CREATE POLICY orders_customer_select ON public.orders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = orders.customer_id AND c.user_id = auth.uid()
  ));

CREATE POLICY order_lines_staff_select ON public.order_lines
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());

CREATE POLICY order_lines_customer_select ON public.order_lines
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
      JOIN public.customers c ON c.id = o.customer_id
     WHERE o.id = order_lines.order_id AND c.user_id = auth.uid()
  ));

-- Defence in depth. Supabase grants table privileges to anon and authenticated
-- on every new table, so RLS would otherwise be the only thing between a client
-- and every order in the system. BOTH halves are required: a REVOKE from PUBLIC
-- alone leaves the explicit role grants in place (see 20261226000011).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.orders      FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.order_lines FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.orders      FROM anon;
REVOKE SELECT ON public.order_lines FROM anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verify the grants actually took, and that the money-spine columns landed.
-- A green `db:check` line has lied here before; assert the objects.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.orders', 'SELECT')
     OR has_table_privilege('anon', 'public.order_lines', 'SELECT')
     OR has_table_privilege('authenticated', 'public.orders', 'INSERT')
     OR has_table_privilege('authenticated', 'public.orders', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.order_lines', 'INSERT')
  THEN
    RAISE EXCEPTION 'orders: a revoke did not take — client roles still hold write or anon-read access';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.orders', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.order_lines', 'INSERT') THEN
    RAISE EXCEPTION 'orders: service_role cannot write — the purchase pipeline would record nothing';
  END IF;

  IF to_regclass('public.orders') IS NULL OR to_regclass('public.order_lines') IS NULL THEN
    RAISE EXCEPTION 'orders: a table is missing after its own CREATE';
  END IF;

  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='booking_transactions' AND column_name='order_id';
  IF NOT FOUND THEN RAISE EXCEPTION 'orders: booking_transactions.order_id missing'; END IF;

  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='booking_commission_snapshot' AND column_name='order_id';
  IF NOT FOUND THEN RAISE EXCEPTION 'orders: booking_commission_snapshot.order_id missing'; END IF;

  PERFORM 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='agency_bookings' AND column_name='order_id';
  IF NOT FOUND THEN RAISE EXCEPTION 'orders: agency_bookings.order_id missing'; END IF;
END $$;

COMMIT;

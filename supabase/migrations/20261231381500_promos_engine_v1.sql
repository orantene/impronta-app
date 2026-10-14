-- Promos engine v1 · PR1 (TUL-935): evolve the promo tables instead of adding a
-- third discount store.
--
-- The repo already killed two rival discount stores, so talent promos extend
-- `tenant_promo_codes` / `tenant_promo_redemptions` rather than sit beside them.
-- What v1 needs that those tables cannot say today: an offer that is not just
-- percent/fixed, a promo with NO code (auto and link promos), an audience, a
-- weekday/time window, drafts, and a redemption that can belong to one LINE of
-- an order (or a booking) rather than the whole order.
--
-- ADDITIVE AND SAFE FOR LIVE READERS. Every new column is nullable or defaulted
-- so existing codes behave exactly as before: offer_kind is derived from `kind`,
-- unlock='code', audience='public', applies_on='purchase'. No column is renamed
-- (`max_redemptions`, `per_customer_limit`, `kind`, `value` are read by live
-- code). The status column came in 20261231381000; it is not redone here.
--
-- THE STACKING DECISION THE OLD COMMENT SAID NOBODY HAD MADE. The old unique
-- index allowed one redemption per order, full stop. v1 rule: ONE live PRICE
-- promo per line, free gifts allowed alongside (is_price_promo=false). "Live"
-- means held or confirmed, so a released hold or a voided use frees the line.
-- Existing rows have a NULL line_id, and NULLs are distinct in a plain unique
-- index, so the per-line index alone would let today's order-level codes stack.
-- Two more partial indexes cover the NULL-line case: one price promo per order
-- (order-level), and one per booking when there is no order.
--
-- `tenant_promo_redemptions_order_code_uniq` (promo_code_id, order_id) is KEPT:
-- redeem_tenant_promo's ON CONFLICT targets it. A NULL order_id (booking-only
-- redemption) never conflicts there, which is correct: booking redemptions are
-- idempotent through the booking indexes instead.
--
-- No SECURITY DEFINER functions here. The only function is a plain trigger that
-- fills offer_kind for writers that predate the column.

BEGIN;

-- ── tenant_promo_codes ─────────────────────────────────────────────────────

ALTER TABLE public.tenant_promo_codes
  ADD COLUMN IF NOT EXISTS name                text,
  ADD COLUMN IF NOT EXISTS template_key        text,
  ADD COLUMN IF NOT EXISTS offer_kind          text,
  ADD COLUMN IF NOT EXISTS addon_id            uuid,
  ADD COLUMN IF NOT EXISTS scope_kind          text NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS min_subtotal_cents  bigint,
  ADD COLUMN IF NOT EXISTS min_qty             integer,
  ADD COLUMN IF NOT EXISTS audience            text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS lapsed_days         integer,
  ADD COLUMN IF NOT EXISTS customer_id         uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_single_use       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unlock              text NOT NULL DEFAULT 'code',
  ADD COLUMN IF NOT EXISTS link_slug           text,
  ADD COLUMN IF NOT EXISTS link_token_hash     text,
  ADD COLUMN IF NOT EXISTS applies_on          text NOT NULL DEFAULT 'purchase',
  ADD COLUMN IF NOT EXISTS use_by_date         date,
  ADD COLUMN IF NOT EXISTS tz                  text,
  ADD COLUMN IF NOT EXISTS weekdays            smallint[],
  ADD COLUMN IF NOT EXISTS time_from           time,
  ADD COLUMN IF NOT EXISTS time_to             time,
  ADD COLUMN IF NOT EXISTS slot_id             uuid,
  ADD COLUMN IF NOT EXISTS budget_cap_cents    bigint,
  ADD COLUMN IF NOT EXISTS payment_rule        text NOT NULL DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS deposit_required    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS leak_guard          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_on_site        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_countdown      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS title_i18n          jsonb,
  ADD COLUMN IF NOT EXISTS description_i18n    jsonb,
  ADD COLUMN IF NOT EXISTS visual_style        text,
  ADD COLUMN IF NOT EXISTS funded_by           text NOT NULL DEFAULT 'talent',
  ADD COLUMN IF NOT EXISTS is_draft            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_paused           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at         timestamptz,
  ADD COLUMN IF NOT EXISTS parent_promo_id     uuid REFERENCES public.tenant_promo_codes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_trial            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS courtesy_reason     text,
  ADD COLUMN IF NOT EXISTS created_by          uuid;

-- offer_kind: derive from the legacy `kind` (percent -> percent, fixed -> fixed),
-- then lock it NOT NULL. Done as add-nullable / backfill / set-not-null so a
-- re-run is harmless and no constant default can mislabel a fixed code.
UPDATE public.tenant_promo_codes SET offer_kind = kind WHERE offer_kind IS NULL;
ALTER TABLE public.tenant_promo_codes ALTER COLUMN offer_kind SET NOT NULL;

-- Writers that predate offer_kind (the live admin discounts form) keep working:
-- the column is filled from `kind` when they leave it out. BEFORE triggers run
-- ahead of the NOT NULL check, so this is sufficient. Not SECURITY DEFINER.
CREATE OR REPLACE FUNCTION public.tenant_promo_codes_default_offer_kind()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.offer_kind IS NULL THEN NEW.offer_kind := NEW.kind; END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS tenant_promo_codes_default_offer_kind_trg ON public.tenant_promo_codes;
CREATE TRIGGER tenant_promo_codes_default_offer_kind_trg
  BEFORE INSERT ON public.tenant_promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.tenant_promo_codes_default_offer_kind();

-- Auto and link promos have no code. The existing unique index
-- tenant_promo_codes_uniq on (tenant_id, upper(code)) is already exactly the
-- required uniqueness: Postgres treats NULLs as distinct, so any number of
-- code-less promos coexist and non-null codes stay unique per tenant. Kept as is.
ALTER TABLE public.tenant_promo_codes ALTER COLUMN code DROP NOT NULL;

DO $c$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('tenant_promo_codes_offer_kind_check',  'offer_kind IN (''percent'',''fixed'',''fixed_price'',''free_addon'',''second_guest'',''pay_in_full'',''free_gift'')'),
    ('tenant_promo_codes_scope_kind_check',  'scope_kind IN (''all'',''services'',''products'',''all_services'')'),
    ('tenant_promo_codes_audience_check',    'audience IN (''public'',''new_clients'',''returning'',''lapsed'',''one_client'')'),
    ('tenant_promo_codes_unlock_check',      'unlock IN (''auto'',''code'',''link'')'),
    ('tenant_promo_codes_applies_on_check',  'applies_on IN (''appointment'',''purchase'')'),
    ('tenant_promo_codes_payment_rule_check','payment_rule IN (''any'',''full_upfront'')'),
    ('tenant_promo_codes_funded_by_check',   'funded_by IN (''talent'',''agency'')'),
    ('tenant_promo_codes_courtesy_reason_check', 'courtesy_reason IS NULL OR courtesy_reason IN (''influencer'',''gift'',''make_good'',''other'')')
  ) AS t(name, expr) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = r.name AND conrelid = 'public.tenant_promo_codes'::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.tenant_promo_codes ADD CONSTRAINT %I CHECK (%s)', r.name, r.expr);
    END IF;
  END LOOP;
END
$c$;

-- A link promo is found by slug; unique per tenant, only where set.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_promo_codes_link_slug_uniq
  ON public.tenant_promo_codes (tenant_id, link_slug) WHERE link_slug IS NOT NULL;

-- ── tenant_promo_redemptions ───────────────────────────────────────────────

ALTER TABLE public.tenant_promo_redemptions
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS list_cents      bigint,
  ADD COLUMN IF NOT EXISTS discount_cents  bigint,
  ADD COLUMN IF NOT EXISTS currency        text,
  ADD COLUMN IF NOT EXISTS source          text,
  ADD COLUMN IF NOT EXISTS source_channel  text,
  ADD COLUMN IF NOT EXISTS client_status   text,
  -- No FK: the repo has two booking tables (agency_bookings, talent_bookings)
  -- and none named `bookings`. Which one a v1 redemption points at is a PR2
  -- decision; a wrong FK here would be a migration to undo.
  ADD COLUMN IF NOT EXISTS booking_id      uuid,
  ADD COLUMN IF NOT EXISTS line_id         uuid,
  ADD COLUMN IF NOT EXISTS is_price_promo  boolean NOT NULL DEFAULT true;

-- Bookings-only redemptions have no order. Safe to relax: the FK stays, no
-- reader in web/src filters or joins on order_id for this table, and the CHECK
-- below keeps a redemption from existing with neither anchor.
ALTER TABLE public.tenant_promo_redemptions ALTER COLUMN order_id DROP NOT NULL;

DO $c$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('tenant_promo_redemptions_source_check',         'source IS NULL OR source IN (''auto'',''code'',''link'',''personal'')'),
    ('tenant_promo_redemptions_source_channel_check', 'source_channel IS NULL OR source_channel IN (''ig_story'',''ig_post'',''tiktok'',''wa'',''qr'',''qr_print'',''link'',''email'',''code'',''site'')'),
    ('tenant_promo_redemptions_client_status_check',  'client_status IS NULL OR client_status IN (''new'',''returning'',''lapsed'')'),
    ('tenant_promo_redemptions_anchor_check',         'order_id IS NOT NULL OR booking_id IS NOT NULL')
  ) AS t(name, expr) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = r.name AND conrelid = 'public.tenant_promo_redemptions'::regclass
    ) THEN
      EXECUTE format('ALTER TABLE public.tenant_promo_redemptions ADD CONSTRAINT %I CHECK (%s)', r.name, r.expr);
    END IF;
  END LOOP;
END
$c$;

-- One live price promo per line (gifts, is_price_promo=false, sit alongside).
DROP INDEX IF EXISTS public.tenant_promo_redemption_per_order;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_promo_redemption_price_per_line
  ON public.tenant_promo_redemptions (order_id, line_id)
  WHERE is_price_promo AND status IN ('held','confirmed')
    AND order_id IS NOT NULL AND line_id IS NOT NULL;
-- Order-level (NULL line): today's one-code-per-order still holds.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_promo_redemption_price_per_order
  ON public.tenant_promo_redemptions (order_id)
  WHERE is_price_promo AND status IN ('held','confirmed')
    AND order_id IS NOT NULL AND line_id IS NULL;
-- Booking-anchored with no order.
CREATE UNIQUE INDEX IF NOT EXISTS tenant_promo_redemption_price_per_booking
  ON public.tenant_promo_redemptions (booking_id, COALESCE(line_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_price_promo AND status IN ('held','confirmed')
    AND order_id IS NULL AND booking_id IS NOT NULL;

-- Hold sweeper: find expired live holds.
CREATE INDEX IF NOT EXISTS tenant_promo_redemption_hold_expiry_idx
  ON public.tenant_promo_redemptions (hold_expires_at)
  WHERE status = 'held' AND hold_expires_at IS NOT NULL;

-- ── promo_targets: scope as a join table, so deleting a service cannot leave a
-- dangling id inside an array (FK integrity is why this is not uuid[]). ──────

CREATE TABLE IF NOT EXISTS public.promo_targets (
  promo_id     uuid NOT NULL REFERENCES public.tenant_promo_codes(id) ON DELETE CASCADE,
  target_kind  text NOT NULL CHECK (target_kind IN ('service','product','addon')),
  target_id    uuid NOT NULL,
  PRIMARY KEY (promo_id, target_kind, target_id)
);

-- ── promo_events: light analytics. Writes are service_role only, so a visitor
-- cannot inflate a venue's view counts from the browser. ──────────────────────

CREATE TABLE IF NOT EXISTS public.promo_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id     uuid NOT NULL REFERENCES public.tenant_promo_codes(id) ON DELETE CASCADE,
  tenant_id    uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('view','link_open','share','code_fail')),
  at           timestamptz NOT NULL DEFAULT now(),
  session_hash text
);
CREATE INDEX IF NOT EXISTS promo_events_promo_at_idx ON public.promo_events (promo_id, at);

-- ── RLS: staff of the tenant read; no anon; writes via service_role only ────

ALTER TABLE public.promo_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_events  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promo_targets_select_staff ON public.promo_targets;
CREATE POLICY promo_targets_select_staff ON public.promo_targets
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tenant_promo_codes c
             WHERE c.id = promo_id AND public.is_staff_of_tenant(c.tenant_id))
  );

DROP POLICY IF EXISTS promo_events_select_staff ON public.promo_events;
CREATE POLICY promo_events_select_staff ON public.promo_events
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

REVOKE ALL ON TABLE public.promo_targets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.promo_events  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.promo_targets TO authenticated;
GRANT SELECT ON TABLE public.promo_events  TO authenticated;

COMMENT ON TABLE public.promo_targets IS
  'Which services / products / add-ons a promo applies to. A join table, not uuid[], for FK integrity.';
COMMENT ON TABLE public.promo_events IS
  'Light promo analytics (view, link_open, share, code_fail). service_role writes only.';
COMMENT ON COLUMN public.tenant_promo_codes.offer_kind IS
  'percent | fixed | fixed_price | free_addon | second_guest | pay_in_full | free_gift. Backfilled from `kind`.';
COMMENT ON COLUMN public.tenant_promo_redemptions.is_price_promo IS
  'true = changes the price (one live per line). false = a gift alongside, exempt from the per-line index.';

-- ── value for offers that are not money off ────────────────────────────────
-- `value > 0` held when every code was percent or fixed. A free extra or a gift
-- has no amount: it is written as kind='fixed', value=0, and offer_kind says
-- what it really is. Percent range and fixed currency checks are unchanged.
ALTER TABLE public.tenant_promo_codes DROP CONSTRAINT IF EXISTS tenant_promo_codes_value_check;
ALTER TABLE public.tenant_promo_codes DROP CONSTRAINT IF EXISTS tenant_promo_codes_value_by_offer;
ALTER TABLE public.tenant_promo_codes ADD CONSTRAINT tenant_promo_codes_value_by_offer
  CHECK (value > 0 OR (value = 0 AND offer_kind IN ('free_addon','free_gift','second_guest','pay_in_full')));

-- ── Assert it landed ───────────────────────────────────────────────────────

DO $check$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO missing FROM unnest(ARRAY[
    'tenant_promo_codes.name','tenant_promo_codes.template_key','tenant_promo_codes.offer_kind',
    'tenant_promo_codes.addon_id','tenant_promo_codes.scope_kind','tenant_promo_codes.min_subtotal_cents',
    'tenant_promo_codes.min_qty','tenant_promo_codes.audience','tenant_promo_codes.lapsed_days',
    'tenant_promo_codes.customer_id','tenant_promo_codes.is_single_use','tenant_promo_codes.unlock',
    'tenant_promo_codes.link_slug','tenant_promo_codes.link_token_hash','tenant_promo_codes.applies_on',
    'tenant_promo_codes.use_by_date','tenant_promo_codes.tz','tenant_promo_codes.weekdays',
    'tenant_promo_codes.time_from','tenant_promo_codes.time_to','tenant_promo_codes.slot_id',
    'tenant_promo_codes.budget_cap_cents','tenant_promo_codes.payment_rule','tenant_promo_codes.deposit_required',
    'tenant_promo_codes.leak_guard','tenant_promo_codes.show_on_site','tenant_promo_codes.show_countdown',
    'tenant_promo_codes.title_i18n','tenant_promo_codes.description_i18n','tenant_promo_codes.visual_style',
    'tenant_promo_codes.funded_by','tenant_promo_codes.is_draft','tenant_promo_codes.is_paused',
    'tenant_promo_codes.archived_at','tenant_promo_codes.parent_promo_id','tenant_promo_codes.is_trial',
    'tenant_promo_codes.courtesy_reason','tenant_promo_codes.created_by',
    'tenant_promo_redemptions.hold_expires_at','tenant_promo_redemptions.list_cents',
    'tenant_promo_redemptions.discount_cents','tenant_promo_redemptions.currency',
    'tenant_promo_redemptions.source','tenant_promo_redemptions.source_channel',
    'tenant_promo_redemptions.client_status','tenant_promo_redemptions.booking_id',
    'tenant_promo_redemptions.line_id','tenant_promo_redemptions.is_price_promo',
    'promo_targets.promo_id','promo_targets.target_kind','promo_targets.target_id',
    'promo_events.id','promo_events.promo_id','promo_events.tenant_id','promo_events.kind',
    'promo_events.at','promo_events.session_hash'
  ]) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = split_part(c, '.', 1) AND column_name = split_part(c, '.', 2)
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'promos_engine_v1: missing columns: %', missing;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='tenant_promo_redemption_price_per_line')
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='tenant_promo_redemptions_order_code_uniq') THEN
    RAISE EXCEPTION 'promos_engine_v1: redemption unique indexes missing';
  END IF;
  IF has_table_privilege('anon', 'public.promo_events', 'SELECT')
     OR has_table_privilege('anon', 'public.promo_targets', 'SELECT') THEN
    RAISE EXCEPTION 'promos_engine_v1: anon can read promo_events/promo_targets';
  END IF;
END
$check$;

COMMIT;

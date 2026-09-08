/**
 * qa-journeys-only: restore money-spine pieces omitted by cheap historical replay.
 * Never production. Never writes a git migration.
 *
 * Adds order_id on agency_bookings / booking_commission_snapshot, and creates
 * booking_transactions in the shape POS cash settle writes (nullable booking_id,
 * metadata JSON, insert-as-paid). Do not copy this DDL onto production.
 */
import dns from "node:dns";
import pg from "pg";
import { assertIsolatedJourneysTarget } from "./isolated-target-guard.mjs";

dns.setDefaultResultOrder("ipv4first");
assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

// Pooler (DATABASE_URL) is IPv4-reachable here; DIRECT_URL is often IPv6-only.
const url = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!url) {
  console.error("[repair-order-id] DATABASE_URL / DIRECT_URL missing");
  process.exit(2);
}

const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

async function hasTable(table) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return rows.length > 0;
}

async function hasColumn(table, column) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return rows.length > 0;
}

async function ensureOrderId(table) {
  if (!(await hasTable(table))) {
    console.log(`[repair-order-id] ${table} missing — skipped`);
    return;
  }
  if (await hasColumn(table, "order_id")) {
    console.log(`[repair-order-id] ${table}.order_id already present`);
    return;
  }
  await client.query(
    `ALTER TABLE public.${table}
       ADD COLUMN order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL`,
  );
  await client.query(
    `CREATE INDEX IF NOT EXISTS ${table}_order_idx
       ON public.${table} (order_id)
       WHERE order_id IS NOT NULL`,
  );
  console.log(`[repair-order-id] ${table}.order_id added on qa-journeys only`);
}

await client.connect();
try {
  await ensureOrderId("agency_bookings");
  await ensureOrderId("booking_commission_snapshot");

  if (await hasTable("booking_transactions")) {
    await ensureOrderId("booking_transactions");
  } else {
    await client.query(`
      CREATE TABLE public.booking_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        booking_id UUID REFERENCES public.agency_bookings(id) ON DELETE CASCADE,
        order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
        source_tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
        source_inquiry_id UUID,
        payer_user_id UUID,
        payer_email TEXT,
        payout_receiver_id UUID,
        payout_receiver_kind TEXT,
        payout_receiver_display_name TEXT,
        gross_amount_cents BIGINT NOT NULL CHECK (gross_amount_cents > 0),
        platform_fee_basis_points INTEGER NOT NULL DEFAULT 0,
        platform_fee_cents BIGINT NOT NULL DEFAULT 0,
        net_amount_cents BIGINT NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'USD',
        provider TEXT NOT NULL DEFAULT 'manual',
        provider_reference TEXT,
        provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL DEFAULT 'paid',
        refund_of_transaction_id UUID,
        requested_at TIMESTAMPTZ,
        paid_at TIMESTAMPTZ,
        payout_initiated_at TIMESTAMPTZ,
        payout_completed_at TIMESTAMPTZ,
        refunded_at TIMESTAMPTZ,
        failed_at TIMESTAMPTZ,
        disputed_at TIMESTAMPTZ,
        failure_reason TEXT,
        checkout_type TEXT NOT NULL DEFAULT 'full',
        provider_refund_id TEXT,
        created_by_profile_id UUID,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT booking_transactions_amount_balance
          CHECK (platform_fee_cents + net_amount_cents = gross_amount_cents)
      )`);
    await client.query(
      `CREATE INDEX booking_transactions_order_idx
         ON public.booking_transactions (order_id)
         WHERE order_id IS NOT NULL`,
    );
    await client.query(
      `ALTER TABLE public.booking_transactions ENABLE ROW LEVEL SECURITY`,
    );
    await client.query(`GRANT ALL ON TABLE public.booking_transactions TO service_role`);
    console.log("[repair-order-id] booking_transactions created on qa-journeys only");
  }

  if (!(await hasColumn("orders", "guest_session_id"))) {
    await client.query(`ALTER TABLE public.orders ALTER COLUMN customer_id DROP NOT NULL`);
    await client.query(`ALTER TABLE public.orders ADD COLUMN guest_session_id TEXT`);
    await client.query(`ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS receipt_code TEXT`);
    await client.query(`
      ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_identified_before_payment;
      ALTER TABLE public.orders ADD CONSTRAINT orders_identified_before_payment
        CHECK (status = 'draft' OR customer_id IS NOT NULL);
      ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_draft_has_an_identity;
      ALTER TABLE public.orders ADD CONSTRAINT orders_draft_has_an_identity
        CHECK (customer_id IS NOT NULL OR guest_session_id IS NOT NULL);
    `);
    console.log("[repair-order-id] orders.guest_session_id + nullable customer_id on qa-journeys only");
  }

  const { rows: offeringPolicies } = await client.query(
    `SELECT polname FROM pg_policy
      WHERE polrelid = 'public.talent_offerings'::regclass
        AND polname = 'talent_offerings_public_read'`,
  );
  if (!(await hasColumn("talent_offerings", "reserve_mode"))) {
    await client.query(`
      ALTER TABLE public.talent_offerings
        ADD COLUMN IF NOT EXISTS reserve_mode text NOT NULL DEFAULT 'full',
        ADD COLUMN IF NOT EXISTS deposit_pct int,
        ADD COLUMN IF NOT EXISTS require_account_to_book boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS cancellation_hours int
    `);
    console.log("[repair-order-id] talent_offerings catalog policy columns on qa-journeys only");
  }

  if (!(await hasTable("talent_offering_variants"))) {
    await client.query(`
      CREATE TABLE public.talent_offering_variants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        offering_id uuid NOT NULL REFERENCES public.talent_offerings(id) ON DELETE CASCADE,
        label text NOT NULL,
        amount_cents int,
        sort_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`GRANT ALL ON TABLE public.talent_offering_variants TO service_role`);
    console.log("[repair-order-id] talent_offering_variants on qa-journeys only");
  }

  if (!(await hasTable("talent_offering_addons"))) {
    await client.query(`
      CREATE TABLE public.talent_offering_addons (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        offering_id uuid NOT NULL REFERENCES public.talent_offerings(id) ON DELETE CASCADE,
        label text NOT NULL,
        amount_cents int NOT NULL DEFAULT 0,
        sort_order int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`GRANT ALL ON TABLE public.talent_offering_addons TO service_role`);
    console.log("[repair-order-id] talent_offering_addons on qa-journeys only");
  }

  if (offeringPolicies.length === 0) {
    await client.query(`
      CREATE POLICY talent_offerings_public_read ON public.talent_offerings
        FOR SELECT USING (
          status = 'published'
          AND visibility IN ('public','on_request')
          AND moderation_state = 'approved'
        )
    `);
    console.log("[repair-order-id] talent_offerings_public_read on qa-journeys only");
  }

  if (!(await hasColumn("talent_profiles", "profile_kind"))) {
    await client.query(`
      ALTER TABLE public.talent_profiles
        ADD COLUMN IF NOT EXISTS profile_kind text NOT NULL DEFAULT 'person'
    `);
    await client.query(`
      ALTER TABLE public.talent_profiles DROP CONSTRAINT IF EXISTS talent_profiles_profile_kind_check;
      ALTER TABLE public.talent_profiles ADD CONSTRAINT talent_profiles_profile_kind_check
        CHECK (profile_kind IN ('person', 'resource'))
    `);
    console.log("[repair-order-id] talent_profiles.profile_kind on qa-journeys only");
  }
  if (!(await hasColumn("talent_profiles", "booking_terms"))) {
    await client.query(`ALTER TABLE public.talent_profiles ADD COLUMN booking_terms jsonb`);
    console.log("[repair-order-id] talent_profiles.booking_terms on qa-journeys only");
  }
  if (!(await hasColumn("talent_profiles", "claimed_at"))) {
    await client.query(`ALTER TABLE public.talent_profiles ADD COLUMN claimed_at timestamptz`);
    console.log("[repair-order-id] talent_profiles.claimed_at on qa-journeys only");
  }
  if (!(await hasColumn("agencies", "plan_tier"))) {
    await client.query(`ALTER TABLE public.agencies ADD COLUMN plan_tier text`);
    console.log("[repair-order-id] agencies.plan_tier on qa-journeys only");
  }
  if (!(await hasColumn("agencies", "discover_exposure_enabled"))) {
    await client.query(`ALTER TABLE public.agencies ADD COLUMN discover_exposure_enabled boolean`);
    console.log("[repair-order-id] agencies.discover_exposure_enabled on qa-journeys only");
  }
  if (!(await hasColumn("agencies", "hub_exposure_tenant_ids"))) {
    await client.query(`ALTER TABLE public.agencies ADD COLUMN hub_exposure_tenant_ids uuid[]`);
    console.log("[repair-order-id] agencies.hub_exposure_tenant_ids on qa-journeys only");
  }
  if (!(await hasColumn("agency_talent_roster", "direct_booking_enabled"))) {
    await client.query(`
      ALTER TABLE public.agency_talent_roster
        ADD COLUMN IF NOT EXISTS exclusivity_status text,
        ADD COLUMN IF NOT EXISTS direct_booking_enabled boolean,
        ADD COLUMN IF NOT EXISTS external_booking_released boolean
    `);
    console.log("[repair-order-id] agency_talent_roster booking gates on qa-journeys only");
  }
  if (!(await hasColumn("inquiries", "source_workspace_id"))) {
    await client.query(`ALTER TABLE public.inquiries ADD COLUMN source_workspace_id uuid`);
    console.log("[repair-order-id] inquiries.source_workspace_id on qa-journeys only");
  }
  if (!(await hasColumn("orders", "inquiry_id"))) {
    await client.query(`ALTER TABLE public.orders ADD COLUMN inquiry_id uuid`);
    console.log("[repair-order-id] orders.inquiry_id on qa-journeys only");
  }
  if (!(await hasColumn("inquiry_messages", "card_payload"))) {
    await client.query(`ALTER TABLE public.inquiry_messages ADD COLUMN card_payload jsonb`);
    console.log("[repair-order-id] inquiry_messages.card_payload on qa-journeys only");
  }
  if (!(await hasTable("talent_booking_hours"))) {
    await client.query(`
      CREATE TABLE public.talent_booking_hours (
        talent_profile_id UUID PRIMARY KEY REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        weekly JSONB NOT NULL DEFAULT '{}'::jsonb,
        exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
        slot_minutes INTEGER NOT NULL DEFAULT 30,
        buffer_before_min INTEGER NOT NULL DEFAULT 0,
        buffer_after_min INTEGER NOT NULL DEFAULT 0,
        min_notice_min INTEGER NOT NULL DEFAULT 120,
        horizon_days INTEGER NOT NULL DEFAULT 60,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await client.query(`GRANT ALL ON TABLE public.talent_booking_hours TO service_role`);
    console.log("[repair-order-id] talent_booking_hours on qa-journeys only");
  }

  await client.query(`NOTIFY pgrst, 'reload schema'`);
} finally {
  await client.end();
}

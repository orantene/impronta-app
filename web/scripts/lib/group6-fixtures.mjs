/**
 * Pure helpers for scripts/seed-group6-staging-fixtures.mjs (Group 6 staging
 * fixtures). No I/O and no process.exit, so the guards are unit-testable.
 *
 * Every row this seed creates has a deterministic id derived from
 * `stableId(key)`, so a re-run lands on the same rows (idempotent) and
 * `--cleanup` can find exactly what it created without a manifest table.
 */
import { createHash } from "node:crypto";

export const STAGING_PROJECT_REF = "fxlankepwnvelxjrahwk";
export const PRODUCTION_PROJECT_REF = "pluhdapdnuiulvxmyspd";
/** Prefix on every slug / profile code / email / title this seed owns. */
export const PREFIX = "qa-fixture-g6";
/** A staging-only agency that does not exist on production (second proof of target). */
export const STAGING_MARKER_AGENCY_ID = "33333333-3333-4333-8333-333333333333";
export const HUB_TENANT_ID = "00000000-0000-0000-0000-000000000002";

/** Deterministic UUIDv4-shaped id so a re-run lands on the same rows. */
export function stableId(key) {
  const h = createHash("sha256").update(`${PREFIX}:${key}`).digest("hex");
  const v = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

export const EMAILS = {
  limpieza: `${PREFIX}-limpieza@impronta.test`,
  quote: `${PREFIX}-quote@impronta.test`,
  client: `${PREFIX}-client@impronta.test`,
  owner: `${PREFIX}-owner@impronta.test`,
};

export function parseArgs(argv) {
  const out = { apply: false, cleanup: false, selftest: false, stripe: false, envFile: null, help: false, errors: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--cleanup") out.cleanup = true;
    else if (a === "--selftest") out.selftest = true;
    else if (a === "--stripe") out.stripe = true;
    else if (a === "--env-file") {
      out.envFile = argv[i + 1] ?? null;
      i += 1;
      if (!out.envFile) out.errors.push("--env-file needs a path");
    } else if (a === "--help" || a === "-h") out.help = true;
    else out.errors.push(`unknown argument ${a}`);
  }
  if (out.selftest && (out.apply || out.cleanup)) out.errors.push("--selftest cannot be combined with --apply or --cleanup");
  return out;
}

/** Minimal KEY=value parser (no dotenv dependency, never logs values). */
export function parseEnvText(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/**
 * Refuse unless the DATABASE_URL is exactly the staging project's pooler/direct
 * login. Returns { ok, reasons }; never includes a secret value.
 */
export function checkDbTarget(env) {
  const reasons = [];
  const dbUrl = String(env.DATABASE_URL ?? "").trim();
  if (!dbUrl) reasons.push("DATABASE_URL is missing");
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && /DATABASE|POSTGRES|SUPABASE/.test(k) && v.toLowerCase().includes(PRODUCTION_PROJECT_REF)) {
      reasons.push(`${k} mentions the PRODUCTION project`);
    }
  }
  if (dbUrl) {
    let u = null;
    try {
      u = new URL(dbUrl);
    } catch {
      reasons.push("DATABASE_URL is not a URL");
    }
    if (u) {
      const user = decodeURIComponent(u.username);
      const host = u.hostname.toLowerCase();
      const pooler = user === `postgres.${STAGING_PROJECT_REF}` && host.endsWith(".pooler.supabase.com");
      const direct = user === "postgres" && host === `db.${STAGING_PROJECT_REF}.supabase.co`;
      if (!pooler && !direct) reasons.push(`DATABASE_URL login must be postgres.${STAGING_PROJECT_REF} (pooler) or db.${STAGING_PROJECT_REF}.supabase.co`);
    }
  }
  const sb = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (sb) {
    let host = "";
    try {
      host = new URL(sb).hostname.toLowerCase();
    } catch {
      reasons.push("NEXT_PUBLIC_SUPABASE_URL is not a URL");
    }
    if (host && host !== `${STAGING_PROJECT_REF}.supabase.co`) reasons.push(`NEXT_PUBLIC_SUPABASE_URL host must be ${STAGING_PROJECT_REF}.supabase.co`);
  }
  return { ok: reasons.length === 0, reasons };
}

/** The Stripe key may only be a TEST secret key. */
export function checkStripeKey(key) {
  if (!key) return { ok: false, reason: "STRIPE_SECRET_KEY is not set" };
  if (!String(key).startsWith("sk_test_")) return { ok: false, reason: "STRIPE_SECRET_KEY must start with sk_test_ (test mode only)" };
  return { ok: true };
}

/** A review/booking day offset in the talent's Cancun wall clock, as an ISO instant. */
export function cancunInstant(baseDate, dayOffset, hour, minute = 0) {
  // America/Cancun is UTC-5 all year (no DST).
  const d = new Date(baseDate.getTime() - 5 * 3600 * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate() + dayOffset;
  return new Date(Date.UTC(y, m, day, hour + 5, minute, 0)).toISOString();
}

/**
 * Tables whose descendants cleanup may purge, as roots. Cleanup only ever
 * follows foreign keys DOWN from rows with these deterministic ids.
 */
export function ownedRootIds() {
  const k = (s) => stableId(s);
  return {
    profiles: [k("user:limpieza"), k("user:quote"), k("user:client"), k("user:owner")],
    agencies: [k("workspace")],
    orders: [k("order:paylater")],
    user_notifications: [k("bell:resolved"), k("bell:needs_you")],
    talent_profiles: [k("talent:limpieza"), k("talent:quote"), k("talent:owner")],
    inquiries: [k("inquiry:offer")],
    agency_bookings: [k("booking:away"), k("booking:refundable"), k("booking:done"), k("booking:done2"), k("booking:done3"), k("booking:paylater"), k("booking:agencyonly")],
    customers: [k("customer:client")],
    media_assets: [k("media:1"), k("media:2"), k("media:3")],
    cms_posts: [k("post:es"), k("post:en"), k("post:expired"), k("post:takedown")],
    talent_reviews: [k("review:1"), k("review:2"), k("review:3")],
  };
}

/**
 * Every table and column the seed writes (insert/clone overrides). Plan mode checks these against
 * information_schema read-only, so schema drift shows up before any write. Keep in step with the seed.
 */
export const SEED_COLUMNS = {
  "auth.users": ["id", "instance_id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "raw_app_meta_data", "raw_user_meta_data", "created_at", "updated_at", "confirmation_token", "recovery_token", "email_change_token_new", "email_change", "is_sso_user", "is_anonymous"],
  "auth.identities": ["id", "user_id", "provider_id", "provider", "identity_data", "last_sign_in_at", "created_at", "updated_at"],
  "public.profiles": ["id", "display_name", "app_role", "account_status", "is_test_account", "onboarding_completed_at"],
  "public.talent_profiles": ["default_currency", "display_name", "first_name", "id", "is_discoverable", "is_publicly_hidden", "is_publicly_listed", "is_test_account", "preferred_locale", "profile_code", "profile_kind", "public_slug_part", "short_bio", "talent_plan_key", "updated_at", "user_id", "visibility", "workflow_status"],
  "public.taxonomy_terms": ["id", "slug"],
  "public.talent_profile_taxonomy": ["display_order", "is_primary", "relationship_type", "talent_profile_id", "taxonomy_term_id", "tenant_id"],
  "public.talent_booking_hours": ["buffer_after_min", "buffer_before_min", "exceptions", "horizon_days", "min_notice_min", "slot_minutes", "talent_profile_id", "tenant_id", "timezone", "weekly"],
  "public.agency_talent_roster": ["agency_visibility", "id", "source_type", "status", "talent_profile_id", "talent_site_hidden", "tenant_id"],
  "public.talent_sites": ["accepting_bookings", "accepting_inquiries", "draft_updated_at", "id", "published_at", "shell_published", "shell_tree", "site_kind", "site_published_at", "site_slug", "status", "talent_profile_id", "version"],
  "public.talent_pages": ["blocks", "blocks_published", "id", "is_home", "nav_label", "published_at", "slug", "sort_order", "status", "talent_profile_id", "theme", "title"],
  "public.media_assets": ["alt", "approval_state", "asset_kind", "bucket_id", "id", "mime_type", "owner_talent_profile_id", "purpose", "storage_path", "tenant_id", "variant_kind"],
  "public.talent_offerings": ["allow_pay_in_person", "amount_cents", "attributes", "booking_mode", "cancellation_hours", "category", "currency", "description", "duration_minutes", "id", "is_featured", "kind", "moderation_state", "owner_kind", "price_display", "price_type", "reserve_mode", "sort_order", "status", "talent_profile_id", "tenant_id", "title", "visibility"],
  "public.talent_offering_media": ["offering_id", "media_asset_id", "sort_order"],
  "public.agencies": ["id", "slug", "display_name", "settings", "default_currency", "preferred_currency", "timezone", "onboarding_completed_at", "created_at", "updated_at", "stripe_account_id", "stripe_account_status", "stripe_charges_enabled", "stripe_payouts_enabled", "stripe_details_submitted", "stripe_account_synced_at", "default_coordinator_user_id", "hub_exposure_tenant_ids"],
  "public.agency_memberships": ["id", "tenant_id", "profile_id", "status", "invited_by", "accepted_at", "created_at", "updated_at", "role"],
  "public.orders": ["id", "customer_id", "inquiry_id", "created_by", "receipt_code", "hold_expires_at", "currency", "subtotal_cents", "total_cents", "created_at", "updated_at", "tenant_id", "status"],
  "public.order_lines": ["id", "order_id", "booking_id", "talent_profile_id", "label", "units", "unit_cents", "total_cents", "offering_id", "created_at"],
  "public.inquiry_messages": ["id", "inquiry_id", "thread_type", "sender_user_id", "message_kind", "body", "metadata", "card_payload", "created_at", "edited_at", "deleted_at"],
  "public.user_notifications": ["id", "user_id", "tenant_id", "title", "body", "origin_kind", "origin_inquiry_id", "origin_event_id", "read_at", "created_at", "kind", "surface"],
  "public.client_profiles": ["id", "user_id", "preferred_locale"],
  "public.customers": ["display_name", "email", "id", "tenant_id", "user_id"],
  "public.agency_bookings": ["client_user_id", "contact_email", "contact_name", "currency_code", "customer_id", "ends_at", "event_date", "id", "internal_notes", "payment_status", "source_type_snapshot", "starts_at", "status", "tenant_id", "timezone", "title", "total_client_revenue", "venue_location_text", "venue_name", "client_revenue_lifecycle", "order_id"],
  "public.talent_bookings": ["all_day", "client_label", "created_by_user_id", "ends_at", "id", "location_text", "starts_at", "status", "talent_profile_id", "tenant_id", "title"],
  "public.booking_talent": ["booking_id", "client_charge_rate", "client_charge_total", "id", "profile_code_snapshot", "role_label", "talent_cost_rate", "talent_cost_total", "talent_name_snapshot", "talent_profile_id", "units"],
  "public.booking_transactions": ["booking_id", "checkout_type", "currency", "gross_amount_cents", "id", "net_amount_cents", "payer_email", "payer_user_id", "platform_fee_basis_points", "platform_fee_cents", "provider", "source_tenant_id", "status", "stripe_platform", "requested_at", "payout_receiver_kind", "payout_receiver_id", "payout_receiver_display_name", "paid_at", "provider_metadata"],
  "public.inquiries": ["client_account_id", "client_user_id", "contact_email", "contact_name", "contact_phone", "created_at", "current_offer_id", "customer_id", "event_date", "id", "message", "owner_user_id", "source_context", "status", "updated_at"],
  "public.inquiry_requirement_groups": ["id", "inquiry_id"],
  "public.inquiry_participants": ["id", "inquiry_id", "requirement_group_id", "talent_profile_id", "user_id", "role"],
  "public.inquiry_offers": ["accepted_at", "created_at", "created_by_user_id", "currency_code", "id", "inquiry_id", "notes", "sent_at", "status", "total_client_price", "updated_at", "valid_until", "version"],
  "public.inquiry_offer_line_items": ["id", "label", "offer_id", "price_snapshot_cents", "source_service_id", "talent_cost", "talent_profile_id", "total_price", "unit_price"],
  "public.talent_reviews": ["anon", "body", "booking_id", "client_user_id", "id", "rating", "status", "talent_profile_id", "tenant_id", "would_book_again"],
  "public.cms_posts": ["body", "cover_image_url", "excerpt", "expires_at", "id", "locale", "published_at", "slug", "status", "taken_down_at", "taken_down_reason", "title", "translation_of", "tenant_id", "talent_profile_id", "created_by", "updated_by", "include_in_sitemap", "noindex", "is_unlisted", "is_featured", "author_profile_id"],
  "public.talent_subscriptions": ["current_period_end", "id", "plan_key", "status", "stripe_customer_id", "stripe_price_id", "stripe_subscription_id", "talent_profile_id", "user_id"],
};

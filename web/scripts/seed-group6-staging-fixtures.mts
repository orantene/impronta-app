/**
 * Group 6 staging fixtures (PM 2026-10-18). STAGING ONLY (fxlankepwnvelxjrahwk).
 *
 * Builds, with NEW rows only (deterministic ids, `qa-fixture-g6` names), the data
 * Verify needs for the cards that were parked "needs a fixture":
 *
 *   T1 "qa-fixture Limpieza Hogar" (talent_portfolio, MXN, unlisted, ONE service, visit at the client's place)
 *      TUL-841/896/933  single-service cleaning site, address field shows (where = client)
 *      TUL-957          one SENT $300 MXN offer, accept-then-pay path (client C)
 *      TUL-1072         an AWAY appointment today on /talent/today
 *      TUL-585          3 published reviews (1 tied to a paid booking = verified)
 *      TUL-1009         published / expired / taken-down posts on the talent site
 *      refund           a paid booking (refundable) + a completed paid booking
 *      TUL-834          (--stripe only) a Stripe TEST customer + subscription row
 *   T2 "qa-fixture Electricista" (quote service, on_request service, priced service with images)
 *   C  "qa-fixture Cliente" client login (accepts the offer, pays, reviews)
 *
 * Modes (default is a READ-ONLY dry run that writes nothing):
 *   (none)      read-only plan: target check + which fixture rows already exist
 *   --selftest  write everything, run --cleanup, assert zero leftovers, ROLLBACK (proves FK/check
 *               constraints and cleanup against the real staging schema; nothing persists)
 *   --apply     write everything and COMMIT (new rows only; re-run is a no-op)
 *   --cleanup   delete ONLY rows reachable from this seed's deterministic ids, COMMIT with --apply
 *   --stripe    with --apply: also create Stripe TEST objects (needs STRIPE_SECRET_KEY=sk_test_...)
 *
 * Env: DATABASE_URL (+ optional NEXT_PUBLIC_SUPABASE_URL) from the process env or --env-file <path>.
 *      QA_FIXTURE_PASSWORD (>= 12 chars) sets the password of the 3 fixture logins; without it
 *      the logins exist but have no password (email-code sign-in only, and the addresses are not real).
 *
 * Run from web/:
 *   npx tsx scripts/seed-group6-staging-fixtures.mts --env-file <tmp> [--selftest|--apply|--cleanup --apply]
 */
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";

import {
  buildDefaultShellTree,
  buildStarterHomePageTree,
} from "../src/lib/talent-site/default-max-site-trees";
import {
  EMAILS,
  HUB_TENANT_ID,
  PREFIX,
  STAGING_MARKER_AGENCY_ID,
  cancunInstant,
  checkDbTarget,
  STRIPE_FIXTURE_SUBSCRIPTIONS,
  ALL_PLAN_LOOKUP_KEYS,
  TEST_COUPON_IDS,
  checkKeyFileMode,
  checkLivemode,
  checkStripeKey,
  describeStripeApply,
  parseKeyFileText,
  planLookupKey,
  ownedRootIds,
  parseArgs,
  parseEnvText,
  SEED_COLUMNS,
  stableId,
} from "./lib/group6-fixtures.mjs";

type Row = Record<string, unknown>;
// `pg` has no type declarations in this repo (no @types/pg), so load it through a non-literal specifier and type the slice we use.
type PgClient = {
  connect(): Promise<void>;
  query(text: string, params?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
  end(): Promise<void>;
};
const PG_MODULE = "pg";
const pgMod = (await import(PG_MODULE)) as { default: { Client: new (cfg: { connectionString?: string; ssl?: unknown }) => PgClient } };
const created: Record<string, string[]> = {};
const existed: Record<string, string[]> = {};
const note = (m: Record<string, string[]>, t: string, id: string) => {
  (m[t] ??= []).push(id);
};
const J = (v: unknown) => JSON.stringify(v);
const id = (k: string) => stableId(k);

const ownerRootPostIds = () => ownedRootIds().cms_posts;

function die(msg: string, code = 1): never {
  console.error(`[group6-fixtures] ${msg}`);
  process.exit(code);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log("usage: seed-group6-staging-fixtures.mts [--env-file path] [--selftest | --apply [--stripe [--stripe-key-file path]] | --cleanup [--apply] | --stripe --preflight]");
  process.exit(0);
}
if (args.errors.length) die(args.errors.join("; "), 2);

const env: Record<string, string | undefined> = { ...process.env };
if (args.envFile) Object.assign(env, parseEnvText(readFileSync(args.envFile, "utf8")));
if (args.stripe) {
  // The key comes from STRIPE_SECRET_KEY or a local file (mode 600), and is never printed.
  const keyFileArg = args.stripeKeyFile as string | null;
  if (keyFileArg) {
    const path = keyFileArg.replace(/^~(?=\/|$)/, homedir());
    let st;
    try {
      st = statSync(path);
    } catch {
      die(`--stripe-key-file: cannot read ${path}`, 2);
    }
    const m = checkKeyFileMode(st.mode);
    if (!m.ok) die(`--stripe-key-file: ${m.reason}`, 2);
    const fromFile = parseKeyFileText(readFileSync(path, "utf8"));
    if (!fromFile) die("--stripe-key-file: no key found in the file", 2);
    env.STRIPE_SECRET_KEY = fromFile;
  }
  const k = checkStripeKey(env.STRIPE_SECRET_KEY);
  if (!k.ok) die(`--stripe: ${k.reason}`, 2);
}
// Preflight is read-only and Stripe-only: it needs no database login.
const verdict = args.preflight ? { ok: true as const, reasons: [] as string[] } : checkDbTarget(env);
if (!verdict.ok) die(`refusing to run:\n  - ${verdict.reasons.join("\n  - ")}`, 2);
const password = env.QA_FIXTURE_PASSWORD?.trim() || null;
if (password && password.length < 12) die("QA_FIXTURE_PASSWORD must be at least 12 characters", 2);

const client = new pgMod.default.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
if (!args.preflight) await client.connect();
const q = (text: string, params: unknown[] = []) => client.query(text, params);

/** insert one row; ON CONFLICT DO NOTHING on the given target (default the id pk). Never updates. */
async function ins(table: string, row: Row, conflict: string[] | null = ["id"]): Promise<boolean> {
  const cols = Object.keys(row);
  const sql =
    `insert into ${table} (${cols.map((c) => `"${c}"`).join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) ` +
    `on conflict ${conflict ? `(${conflict.map((c) => `"${c}"`).join(",")})` : ""} do nothing`;
  const r = await q(sql, cols.map((c) => row[c]));
  const key = String(row.id ?? conflict?.map((c) => row[c]).join("/") ?? "row");
  if ((r.rowCount ?? 0) > 0) note(created, table, key);
  else note(existed, table, key);
  return (r.rowCount ?? 0) > 0;
}

/** clone a template row with overrides (json_populate_record keeps every NOT NULL default right). */
async function clone(table: string, templateWhere: string, templateParams: unknown[], overrides: Row): Promise<boolean> {
  // Generated columns (e.g. inquiry_messages.body_tsv) cannot be inserted: copy only the writable ones.
  const [schema, name] = table.includes(".") ? table.split(".") : ["public", table];
  const colRes = await q(
    "select column_name from information_schema.columns where table_schema = $1 and table_name = $2 and is_generated = 'NEVER' order by ordinal_position",
    [schema, name],
  );
  const cols = colRes.rows.map((c) => '"' + (c.column_name as string) + '"').join(",");
  const r = await q(
    `insert into ${table} (${cols}) select ${cols} from (select r.* from ${table} s, ` +
      `json_populate_record(null::${table}, (to_jsonb(s) || $${templateParams.length + 1}::jsonb)::json) r ` +
      `where ${templateWhere}) t on conflict (id) do nothing`,
    [...templateParams, J(overrides)],
  );
  const key = String(overrides.id);
  if ((r.rowCount ?? 0) > 0) note(created, table, key);
  else note(existed, table, key);
  return (r.rowCount ?? 0) > 0;
}

async function assertStagingMarker() {
  const r = await q("select 1 from public.agencies where id = $1", [STAGING_MARKER_AGENCY_ID]);
  if (!r.rowCount) die("staging marker agency (qa-journeys) not found: this is not the staging database, refusing", 2);
  const hub = await q("select 1 from public.agencies where id = $1", [HUB_TENANT_ID]);
  if (!hub.rowCount) die("hub tenant not found, refusing", 2);
}

// ------------------------------------------------------------------ users
async function seedUser(key: "limpieza" | "quote" | "client" | "client2" | "owner", email: string, name: string, role: "talent" | "client") {
  const uid = id(`user:${key}`);
  const crypt = password ? "extensions.crypt($3::text, extensions.gen_salt('bf'))" : "''";
  const exists = await q("select 1 from auth.users where id = $1", [uid]);
  if (exists.rowCount) {
    note(existed, "auth.users", uid);
  } else {
    await q(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user, is_anonymous)
       values ($1::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2::text, ${crypt}, now(),
         '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name',$4::text), now(), now(),
         '','','','',false,false)`,
      password ? [uid, email, password, name] : [uid, email, null, name],
    );
    note(created, "auth.users", uid);
    await q(
      `insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
       values (gen_random_uuid(), $1::uuid, $3::text, 'email',
         jsonb_build_object('sub',$3::text,'email',$2::text,'email_verified',true), now(), now(), now())`,
      [uid, email, uid],
    );
  }
  // The on_auth_user_created trigger inserts the profiles row; set it up (our own new row only).
  await ins("public.profiles", { id: uid, display_name: name, app_role: role, account_status: "active", is_test_account: true });
  await q(
    "update public.profiles set display_name=$2, app_role=$3, account_status='active', onboarding_completed_at=coalesce(onboarding_completed_at, now()), is_test_account=true where id=$1",
    [uid, name, role],
  );
  return uid;
}

// ------------------------------------------------------------------ talents
type TalentSpec = {
  key: "limpieza" | "quote" | "owner";
  profileCode: string;
  display: string;
  first: string;
  tagline: string;
  slug: string;
  taxonomySlug: string;
};

async function seedTalent(spec: TalentSpec, userId: string) {
  const tid = id(`talent:${spec.key}`);
  const now = new Date().toISOString();
  await ins("public.talent_profiles", {
    id: tid,
    user_id: userId,
    profile_code: spec.profileCode,
    public_slug_part: spec.profileCode,
    display_name: spec.display,
    first_name: spec.first,
    profile_kind: "person",
    short_bio: spec.tagline,
    preferred_locale: "es",
    default_currency: "MXN",
    talent_plan_key: "talent_portfolio",
    workflow_status: "approved",
    visibility: "public",
    is_publicly_listed: false,
    is_discoverable: false,
    is_publicly_hidden: false,
    is_test_account: true,
    updated_at: now,
  });
  const tax = await q("select id from public.taxonomy_terms where slug = $1 limit 1", [spec.taxonomySlug]);
  if (tax.rowCount) {
    await ins(
      "public.talent_profile_taxonomy",
      {
        talent_profile_id: tid,
        taxonomy_term_id: tax.rows[0].id,
        is_primary: true,
        relationship_type: "primary_role",
        display_order: 0,
        tenant_id: HUB_TENANT_ID,
      },
      null,
    );
  }
  await ins(
    "public.talent_booking_hours",
    {
      talent_profile_id: tid,
      tenant_id: HUB_TENANT_ID,
      timezone: "America/Cancun",
      weekly: J({
        "0": [],
        "1": [{ startMin: 540, endMin: 1080 }],
        "2": [{ startMin: 540, endMin: 1080 }],
        "3": [{ startMin: 540, endMin: 1080 }],
        "4": [{ startMin: 540, endMin: 1080 }],
        "5": [{ startMin: 540, endMin: 1080 }],
        "6": [{ startMin: 540, endMin: 1080 }],
      }),
      exceptions: J([]),
      slot_minutes: 30,
      buffer_before_min: 0,
      buffer_after_min: 0,
      min_notice_min: 60,
      horizon_days: 60,
    },
    ["talent_profile_id"],
  );
  // Hub roster: the auto-enroll trigger usually does it; make sure, new row only.
  const roster = await q("select 1 from public.agency_talent_roster where tenant_id=$1 and talent_profile_id=$2", [HUB_TENANT_ID, tid]);
  if (!roster.rowCount) {
    await ins("public.agency_talent_roster", {
      id: id(`roster:${spec.key}`),
      tenant_id: HUB_TENANT_ID,
      talent_profile_id: tid,
      source_type: "independent",
      status: "active",
      agency_visibility: "site_visible",
      talent_site_hidden: false,
    });
  }
  const shell = buildDefaultShellTree({ displayName: spec.display });
  const home = buildStarterHomePageTree({ displayName: spec.display, tagline: spec.tagline });
  await ins(
    "public.talent_sites",
    {
      id: id(`site:${spec.key}`),
      talent_profile_id: tid,
      site_kind: "talent_personal",
      status: "published",
      site_slug: spec.slug,
      shell_tree: J(shell),
      shell_published: J(shell),
      published_at: now,
      site_published_at: now,
      version: 1,
      draft_updated_at: now,
      accepting_bookings: true,
      accepting_inquiries: true,
    },
    ["talent_profile_id"],
  );
  await ins(
    "public.talent_pages",
    {
      id: id(`page:${spec.key}`),
      talent_profile_id: tid,
      slug: "home",
      title: spec.display,
      status: "published",
      blocks: J(home),
      blocks_published: J(home),
      theme: J({}),
      is_home: true,
      sort_order: 0,
      nav_label: "Home",
      published_at: now,
    },
    ["talent_profile_id", "slug"],
  );
  return tid;
}

// Three existing public stock photos (storage objects already on staging); new media_assets rows only.
const STOCK_PATHS = [
  "tenant/a2968a2e-1ebd-48c0-a04f-b53cede55c1b/stock/3e154cfd-b23e-44b3-ae55-5450382582be.jpg",
  "tenant/a2968a2e-1ebd-48c0-a04f-b53cede55c1b/stock/afdcd815-d1dc-4c4d-9441-1caa5cceb599.jpg",
  "tenant/a2968a2e-1ebd-48c0-a04f-b53cede55c1b/stock/3167c48c-b4f1-4729-9551-01f09df1daf3.jpg",
];

async function seedMedia(t1: string) {
  for (let i = 0; i < STOCK_PATHS.length; i += 1) {
    await ins("public.media_assets", {
      id: id(`media:${i + 1}`),
      owner_talent_profile_id: t1,
      bucket_id: "media-public",
      storage_path: STOCK_PATHS[i],
      variant_kind: "original",
      approval_state: "approved",
      tenant_id: HUB_TENANT_ID,
      purpose: "cms",
      alt: `${PREFIX} stock photo ${i + 1}`,
      mime_type: "image/jpeg",
      asset_kind: "image",
    });
  }
}

type OfferingSpec = {
  key: string;
  talentKey: "limpieza" | "quote";
  title: string;
  titleEn: string;
  description: string;
  priceType: string;
  priceDisplay: string;
  amountCents: number | null;
  bookingMode: "instant" | "request";
  visibility: "public" | "on_request";
  duration: number;
  category: string;
  sort: number;
  images: number[];
};

async function seedOffering(spec: OfferingSpec, talentId: string) {
  const oid = id(`offering:${spec.key}`);
  await ins("public.talent_offerings", {
    id: oid,
    talent_profile_id: talentId,
    tenant_id: HUB_TENANT_ID,
    kind: "service",
    title: spec.title,
    description: spec.description,
    price_type: spec.priceType,
    price_display: spec.priceDisplay,
    amount_cents: spec.amountCents,
    currency: "MXN",
    booking_mode: spec.bookingMode,
    allow_pay_in_person: true,
    duration_minutes: spec.duration,
    category: spec.category,
    status: "published",
    visibility: spec.visibility,
    moderation_state: "approved",
    is_featured: false,
    sort_order: spec.sort,
    attributes: J({ where: ["client"] }),
    title_i18n: J({ es: spec.title, en: spec.titleEn }),
    owner_kind: "talent",
    reserve_mode: "full",
    cancellation_hours: 24,
  });
  for (const n of spec.images) {
    await ins("public.talent_offering_media", { offering_id: oid, media_asset_id: id(`media:${n}`), sort_order: n }, null);
  }
  return oid;
}

// ------------------------------------------------------------------ bookings / money / offer / reviews / posts
async function seedBooking(opts: {
  key: "away" | "refundable" | "done" | "done2" | "done3" | "paylater" | "agencyonly" | "paid2";
  title: string;
  startsAt: string;
  endsAt: string;
  bookingStatus: "confirmed" | "completed";
  address: string;
  paid: boolean;
  amountCents: number;
  provider: "stripe" | "manual";
  clientUser: string;
  customerId: string;
  t1: string;
  t1User: string;
  paymentIntentId?: string | null;
  orderId?: string | null;
  clientName?: string;
  clientEmail?: string;
  /** agency booking id with NO talent_bookings row (TUL-1244 record fallback). */
  skipTalentBooking?: boolean;
}) {
  const bid = id(`booking:${opts.key}`);
  await ins("public.agency_bookings", {
    id: bid,
    tenant_id: HUB_TENANT_ID,
    title: opts.title,
    status: opts.bookingStatus,
    starts_at: opts.startsAt,
    ends_at: opts.endsAt,
    currency_code: "MXN",
    payment_status: "unpaid",
    total_client_revenue: opts.amountCents / 100,
    contact_name: opts.clientName ?? "qa-fixture Cliente",
    contact_email: opts.clientEmail ?? EMAILS.client,
    client_user_id: opts.clientUser,
    customer_id: opts.customerId,
    venue_name: opts.address.split(",")[0],
    venue_location_text: opts.address,
    timezone: "America/Cancun",
    source_type_snapshot: "manual",
    internal_notes: `${PREFIX}: staging fixture, safe to delete via --cleanup`,
    event_date: opts.startsAt.slice(0, 10),
    ...(opts.orderId ? { order_id: opts.orderId } : {}),
  });
  if (!opts.skipTalentBooking) await ins("public.talent_bookings", {
    id: bid,
    talent_profile_id: opts.t1,
    tenant_id: HUB_TENANT_ID,
    title: opts.title,
    client_label: opts.clientName ?? "qa-fixture Cliente",
    location_text: opts.address,
    starts_at: opts.startsAt,
    ends_at: opts.endsAt,
    all_day: false,
    status: opts.bookingStatus,
    created_by_user_id: opts.t1User,
  });
  await ins("public.booking_talent", {
    id: id(`booking_talent:${opts.key}`),
    booking_id: bid,
    talent_profile_id: opts.t1,
    talent_name_snapshot: "qa-fixture Limpieza Hogar",
    profile_code_snapshot: "TAL-96001",
    role_label: "Limpieza",
    units: 1,
    talent_cost_rate: opts.amountCents / 100,
    client_charge_rate: opts.amountCents / 100,
    talent_cost_total: opts.amountCents / 100,
    client_charge_total: opts.amountCents / 100,
  });
  if (opts.paid) {
    const tx = id(`txn:${opts.key}`);
    const fee = Math.round((opts.amountCents * 600) / 10000);
    // The DB accepts new money rows as draft only; walk draft -> payment_requested -> paid like the app.
    const made = await ins("public.booking_transactions", {
      id: tx,
      booking_id: bid,
      source_tenant_id: HUB_TENANT_ID,
      payer_user_id: opts.clientUser,
      payer_email: opts.clientEmail ?? EMAILS.client,
      gross_amount_cents: opts.amountCents,
      platform_fee_basis_points: 600,
      platform_fee_cents: fee,
      net_amount_cents: opts.amountCents - fee,
      currency: "MXN",
      provider: opts.provider,
      status: "draft",
      checkout_type: "full",
      stripe_platform: "us",
    });
    if (made) {
      await q(
        `update public.booking_transactions set status='payment_requested', requested_at=now(),
           payout_receiver_kind='talent', payout_receiver_id=$2, payout_receiver_display_name='QA Paid Owner (fixture)' where id=$1`,
        // Same hub payout account the TUL-690 paid-guest seed uses (payout_accounts is tenant-scoped; no new account is created).
        [tx, "16c37580-f88b-4863-ba90-3d5995f24af4"],
      );
      await q(
        `update public.booking_transactions set status='paid', paid_at=$3, provider_metadata=$2::jsonb where id=$1`,
        [tx, J({ seed: PREFIX, ...(opts.paymentIntentId ? { payment_intent_id: opts.paymentIntentId } : {}) }), opts.startsAt < new Date().toISOString() ? opts.startsAt : new Date().toISOString()],
      );
      await q("update public.agency_bookings set payment_status='paid', client_revenue_lifecycle='fully_paid' where id=$1", [bid]);
    }
  }
  return bid;
}

async function seedOfferChain(t1: string, t1User: string, clientUser: string, customerId: string, o1: string) {
  const inq = id("inquiry:offer");
  const offer = id("offer:sent");
  const group = id("reqgroup:offer");
  const TEMPLATE_INQ = "590da39b-4687-4dda-9c85-36746817c9ab";
  const days = (n: number) => new Date(Date.now() + n * 86400000).toISOString();
  await clone("public.inquiries", "s.id = $1", [TEMPLATE_INQ], {
    id: inq,
    contact_name: "qa-fixture Cliente",
    contact_email: EMAILS.client,
    contact_phone: null,
    client_user_id: clientUser,
    client_account_id: null,
    owner_user_id: t1User,
    customer_id: customerId,
    message: `${PREFIX}: solicitud de limpieza (fixture TUL-957)`,
    event_date: days(30).slice(0, 10),
    current_offer_id: null,
    status: "coordination", // offer_pending needs the offer to exist first; flipped below
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    source_context: {
      host_kind: "hub",
      talent_ids: [t1],
      referrer_page: "/t/TAL-96001",
      host_tenant_id: HUB_TENANT_ID,
    },
  });
  await clone("public.inquiry_requirement_groups", "s.inquiry_id = $1", [TEMPLATE_INQ], { id: group, inquiry_id: inq });
  const parts = await q("select id, role from public.inquiry_participants where inquiry_id = $1", [TEMPLATE_INQ]);
  for (const p of parts.rows) {
    const isTalent = p.role === "talent";
    await clone("public.inquiry_participants", "s.id = $1", [p.id], {
      id: id(`participant:${isTalent ? "talent" : "client"}`),
      inquiry_id: inq,
      requirement_group_id: group,
      user_id: isTalent ? t1User : clientUser,
      talent_profile_id: isTalent ? t1 : null,
    });
  }
  await clone("public.inquiry_offers", "s.inquiry_id = $1 and s.status = 'sent'", [TEMPLATE_INQ], {
    id: offer,
    inquiry_id: inq,
    version: 1,
    status: "sent",
    total_client_price: 300,
    currency_code: "MXN",
    notes: `${PREFIX}: oferta de prueba de $300 MXN`,
    valid_until: days(14),
    sent_at: new Date().toISOString(),
    accepted_at: null,
    created_by_user_id: t1User,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  await clone("public.inquiry_offer_line_items", "s.offer_id = '01eb51b4-aac4-4116-8e51-f4606e93e496'", [], {
    id: id("offer_line:1"),
    offer_id: offer,
    talent_profile_id: t1,
    label: "Limpieza de casa",
    source_service_id: o1,
    unit_price: 300,
    total_price: 300,
    talent_cost: 300,
    price_snapshot_cents: 30000,
  });
  await q("update public.inquiries set current_offer_id = $2, status = 'offer_pending' where id = $1 and current_offer_id is null", [inq, offer]);
  return { inq, offer };
}

async function seedReviews(t1: string, clientUser: string, doneBookings: string[]) {
  const rows = [
    { k: "review:1", booking: doneBookings[0], rating: 5, body: "Puntuales y muy cuidadosos. La casa quedo impecable." },
    { k: "review:2", booking: doneBookings[1], rating: 4, body: "Muy buen servicio, volvere a contratar." },
    { k: "review:3", booking: doneBookings[2], rating: 5, body: "Excelente trato y todo muy limpio." },
  ];
  for (const r of rows) {
    await ins("public.talent_reviews", {
      id: id(r.k),
      tenant_id: HUB_TENANT_ID,
      talent_profile_id: t1,
      booking_id: r.booking,
      client_user_id: clientUser,
      rating: r.rating,
      body: r.body,
      status: "published",
      would_book_again: true,
      anon: false,
    });
  }
}

/**
 * Posts live under the OWNER'S WORKSPACE (tenant scope), not on the talent profile. The talent scope
 * (talent_profile_id set, tenant_id NULL) cannot exist on staging today: `cms_posts.tenant_id` is still
 * NOT NULL there (the Posts v1 migration was recorded earlier under 20261014220352 without the DROP NOT NULL),
 * so a row with tenant_id = hub is invisible to the talent reader AND would leak into the hub's public blog.
 * Workspace scope renders on the workspace site: <hub>/w/qa-fixture-g6-ws/blog/<slug>.
 */
async function seedPosts(ws: string, ownerUser: string) {
  // Earlier runs wrote these four ids under the hub tenant (wrong scope). Remove only OUR rows in that scope.
  await q("delete from public.cms_posts where id = any($1::uuid[]) and tenant_id = $2", [ownerRootPostIds(), HUB_TENANT_ID]);
  const now = new Date();
  const ago = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
  const base = {
    tenant_id: ws,
    talent_profile_id: null,
    created_by: ownerUser,
    updated_by: ownerUser,
    include_in_sitemap: true,
    noindex: false,
    is_unlisted: false,
    is_featured: false,
    author_profile_id: ownerUser,
  };
  const esId = id("post:es");
  await ins("public.cms_posts", {
    ...base,
    id: esId,
    locale: "es",
    slug: `${PREFIX}-guia-limpieza`,
    title: "Guia rapida para mantener tu casa limpia",
    excerpt: "Tres habitos sencillos para que la limpieza semanal sea mas facil.",
    body: "Ventila a diario, ordena antes de limpiar y deja la limpieza profunda para una visita mensual.",
    status: "published",
    published_at: ago(2),
    cover_image_url: null,
  });
  await ins("public.cms_posts", {
    ...base,
    id: id("post:en"),
    locale: "en",
    slug: `${PREFIX}-cleaning-guide`,
    title: "A quick guide to keeping your home clean",
    excerpt: "Three simple habits that make weekly cleaning easier.",
    body: "Air the house daily, tidy before you clean, and keep deep cleaning for a monthly visit.",
    status: "published",
    published_at: ago(2),
    translation_of: esId,
  });
  await ins("public.cms_posts", {
    ...base,
    id: id("post:expired"),
    locale: "es",
    slug: `${PREFIX}-oferta-vencida`,
    title: "Oferta de temporada (vencida)",
    excerpt: "Este articulo ya vencio.",
    body: "Contenido de un articulo con fecha de vencimiento pasada.",
    status: "published",
    published_at: ago(30),
    expires_at: ago(1),
  });
  await ins("public.cms_posts", {
    ...base,
    id: id("post:takedown"),
    locale: "es",
    slug: `${PREFIX}-articulo-oculto`,
    title: "Articulo oculto por Tulala",
    excerpt: "Este articulo fue retirado.",
    body: "Contenido retirado.",
    status: "published",
    published_at: ago(10),
    taken_down_at: ago(1),
    taken_down_reason: `${PREFIX} takedown state`,
  });
}

// ------------------------------------------------------------------ retest fixtures (2026-10-18 map)
const TEMPLATE_WORKSPACE = "290eabc3-616b-4723-8cbf-7687b6c9c6b6"; // qa-b7-studio (free workspace), read as a shape template only
const TEMPLATE_PAYLATER_ORDER = "4f965f34-68a9-4deb-b114-cbeac9e2eb7e"; // pending_payment order of a QA booking, read as a template only
const TEMPLATE_OFFER_MSG = "026464fa-e5a7-480a-981a-3721cc9b78d7";
const TEMPLATE_TEXT_MSG = "b72f00df-e21b-4b11-9d6e-7a455ba87974";
const TEMPLATE_GUEST_INQ = "590da39b-4687-4dda-9c85-36746817c9ab"; // a guest (no client user) QA inquiry, read as a shape template only
const TEMPLATE_OFFER_ID = "01eb51b4-aac4-4116-8e51-f4606e93e496";

/** TUL-1255 / TUL-1182 / TUL-734: a workspace (MXN, no payments yet) whose owner also has the talent role. */
async function seedWorkspace(ownerUser: string) {
  const ws = id("workspace");
  const now = new Date().toISOString();
  await clone("public.agencies", "s.id = $1", [TEMPLATE_WORKSPACE], {
    id: ws,
    slug: `${PREFIX}-ws`,
    display_name: "qa-fixture Estudio",
    settings: {},
    default_currency: "MXN",
    preferred_currency: "MXN",
    timezone: "America/Cancun",
    onboarding_completed_at: now,
    created_at: now,
    updated_at: now,
  });
  await clone("public.agency_memberships", "s.tenant_id = $1 and s.role = 'owner'", [TEMPLATE_WORKSPACE], {
    id: id("membership:owner"),
    tenant_id: ws,
    profile_id: ownerUser,
    status: "active",
    invited_by: null,
    accepted_at: now,
    created_at: now,
    updated_at: now,
  });
  return ws;
}

/** TUL-1252: an unpaid, order-backed visit so the client's "Pagar ahora" mints a /pay/<code> link itself (links expire, so none is pre-made). */
async function seedPayLaterOrder(customerId: string) {
  const oid = id("order:paylater");
  const now = new Date().toISOString();
  await clone("public.orders", "s.id = $1", [TEMPLATE_PAYLATER_ORDER], {
    id: oid,
    customer_id: customerId,
    inquiry_id: null,
    created_by: null,
    receipt_code: null,
    hold_expires_at: null,
    currency: "MXN",
    subtotal_cents: 80000,
    total_cents: 80000,
    created_at: now,
    updated_at: now,
  });
  return oid;
}

async function seedPayLaterLine(orderId: string, bookingId: string, t1: string) {
  await clone("public.order_lines", "s.order_id = $1", [TEMPLATE_PAYLATER_ORDER], {
    id: id("order_line:paylater"),
    order_id: orderId,
    booking_id: bookingId,
    talent_profile_id: t1,
    label: "QA Limpieza de casa (pagar despues)",
    units: 1,
    unit_cents: 80000,
    total_cents: 80000,
    offering_id: null,
    created_at: new Date().toISOString(),
  });
}

/** TUL-1258: message history on the client's inquiry thread (client request, talent reply, offer card). */
async function seedMessages(inq: string, offer: string, clientUser: string, t1User: string) {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60000).toISOString();
  const tpl = await q("select card_payload from public.inquiry_messages where id = $1", [TEMPLATE_OFFER_MSG]);
  const payload = tpl.rowCount ? JSON.parse(JSON.stringify(tpl.rows[0].card_payload).split(TEMPLATE_OFFER_ID).join(offer)) : null;
  const text = (key: string, sender: string, body: string, minutesAgo: number) =>
    clone("public.inquiry_messages", "s.id = $1", [TEMPLATE_TEXT_MSG], {
      id: id(key), inquiry_id: inq, thread_type: "group", sender_user_id: sender, message_kind: "text", body,
      metadata: {}, card_payload: null, created_at: at(minutesAgo), edited_at: null, deleted_at: null,
    });
  await text("msg:client", clientUser, "Hola, necesito una limpieza profunda de mi casa antes del fin de mes.", 30);
  await text("msg:talent", t1User, "Claro, con gusto. Te envio una oferta con el precio y la fecha.", 20);
  if (payload) {
    await clone("public.inquiry_messages", "s.id = $1", [TEMPLATE_OFFER_MSG], {
      id: id("msg:offer"), inquiry_id: inq, sender_user_id: t1User, card_payload: payload, created_at: at(10),
    });
  }
}

/** Signed-out guest inquiry (no client account) with a short client thread to T1, for the guest-inbox Lighthouse card (TUL-1103). */
async function seedGuestThread(t1: string, t1User: string) {
  const gs = id("guest_session");
  const inq = id("inquiry:guest");
  const group = id("reqgroup:guest");
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60000).toISOString();
  await ins("public.guest_sessions", { id: gs, session_key: id("guest_session_key") });
  await clone("public.inquiries", "s.id = $1", [TEMPLATE_GUEST_INQ], {
    id: inq,
    contact_name: "qa-fixture Invitado",
    contact_email: EMAILS.guest,
    contact_phone: null,
    client_user_id: null,
    client_account_id: null,
    guest_session_id: gs,
    owner_user_id: t1User,
    customer_id: null,
    status: "coordination",
    current_offer_id: null,
    message: `${PREFIX}: consulta de un invitado (fixture TUL-1103)`,
    event_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    created_at: at(60),
    updated_at: at(5),
    source_context: { host_kind: "hub", talent_ids: [t1], referrer_page: "/t/TAL-96001", host_tenant_id: HUB_TENANT_ID },
  });
  await clone("public.inquiry_requirement_groups", "s.inquiry_id = $1", [TEMPLATE_GUEST_INQ], { id: group, inquiry_id: inq });
  const parts = await q("select id, role from public.inquiry_participants where inquiry_id = $1", [TEMPLATE_GUEST_INQ]);
  for (const p of parts.rows) {
    const isTalent = p.role === "talent";
    await clone("public.inquiry_participants", "s.id = $1", [p.id], {
      id: id(`participant:guest:${isTalent ? "talent" : "client"}`),
      inquiry_id: inq,
      requirement_group_id: group,
      user_id: isTalent ? t1User : null,
      talent_profile_id: isTalent ? t1 : null,
    });
  }
  const text = (key: string, sender: string | null, guestSession: string | null, body: string, minutesAgo: number) =>
    clone("public.inquiry_messages", "s.id = $1", [TEMPLATE_TEXT_MSG], {
      id: id(key), inquiry_id: inq, thread_type: "private", sender_user_id: sender, guest_session_id: guestSession,
      message_kind: "text", body, metadata: {}, card_payload: null, created_at: at(minutesAgo), edited_at: null, deleted_at: null,
    });
  await text("msg:guest:1", null, gs, "Hola, me gustaria cotizar una limpieza para mi casa el proximo mes.", 45);
  await text("msg:guest:2", t1User, null, "Con gusto. Me confirmas la direccion y los metros cuadrados?", 30);
  await text("msg:guest:3", null, gs, "Es un departamento de 80 m2 en la zona centro.", 20);
  return { inq, gs };
}

/** TUL-391: English-stored support-ticket bells for the ES talent (the bell must localize them at render). */
async function seedTicketBells(t1User: string) {
  const tpl = await q("select id from public.user_notifications where surface = 'talent' and kind = 'ticket' and title like 'Resolved:%' limit 1");
  if (!tpl.rowCount) {
    console.log("[group6-fixtures] note: no ticket-bell template row on staging, skipping TUL-391 bells");
    return;
  }
  const rows = [
    { k: "bell:resolved", title: "Resolved: qa-fixture-g6 ticket (prueba)", body: "Rate how it went if you have a moment.", origin: "support.ticket.resolved" },
    { k: "bell:needs_you", title: "Your ticket needs you", body: "Support replied to your ticket.", origin: "support.ticket.needs_you" },
  ];
  for (const r of rows) {
    await clone("public.user_notifications", "s.id = $1", [tpl.rows[0].id], {
      id: id(r.k), user_id: t1User, tenant_id: HUB_TENANT_ID, title: r.title, body: r.body, origin_kind: r.origin,
      origin_inquiry_id: null, origin_event_id: null, read_at: null, created_at: new Date().toISOString(),
    });
  }
}

// ------------------------------------------------------------------ Stripe TEST (optional, --stripe)
// Re-run safety: Stripe idempotency keys last only 24h, so every object is looked up first
// (customers / PaymentIntents by metadata search, subscriptions by customer, prices by lookup key)
// and the idempotency key is only a second guard inside one run.
type StripeClient = InstanceType<(typeof import("stripe"))["default"]>;
let stripeClient: StripeClient | null = null;

async function openStripe(): Promise<StripeClient> {
  if (stripeClient) return stripeClient;
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(env.STRIPE_SECRET_KEY as string);
  const [balance, account] = await Promise.all([stripe.balance.retrieve(), stripe.accounts.retrieveCurrent()]);
  const live = checkLivemode({
    balanceLivemode: (balance as unknown as { livemode?: boolean }).livemode,
    accountLivemode: (account as unknown as { livemode?: boolean }).livemode,
  });
  if (!live.ok) die(`--stripe: ${live.reason}`, 2);
  stripeClient = stripe;
  return stripe;
}

const metaQuery = (k: string, v: string) => `metadata['${k}']:'${v}'`;

async function findCustomer(stripe: StripeClient, key: string) {
  const found = await stripe.customers.search({ query: `${metaQuery("seed", PREFIX)} AND ${metaQuery("fixture_key", key)}`, limit: 1 });
  return found.data[0] ?? null;
}

async function priceByLookup(stripe: StripeClient, lookupKey: string) {
  const found = await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 });
  return found.data[0] ?? null;
}

/** (a) paid-plan fixtures: a TEST customer + subscription on the catalog TEST price, one row in talent_subscriptions each. */
async function seedStripePlans(rows: Array<{ key: "limpieza" | "owner"; talentId: string; userId: string; email: string; name: string }>) {
  const stripe = await openStripe();
  for (const spec of STRIPE_FIXTURE_SUBSCRIPTIONS) {
    const row = rows.find((r) => r.key === spec.key);
    if (!row) continue;
    const sid = spec.key === "limpieza" ? id("talent_subscription") : id(`talent_subscription:${spec.key}`);
    const have = await q("select 1 from public.talent_subscriptions where id = $1", [sid]);
    if (have.rowCount) {
      note(existed, "public.talent_subscriptions", sid);
      continue;
    }
    const lookup = planLookupKey(spec.planKey, spec.interval);
    const price = await priceByLookup(stripe, lookup);
    if (!price) die(`TEST price ${lookup} does not exist: run web/scripts/seed-stripe-test-prices.mjs first`, 2);
    let customer = await findCustomer(stripe, spec.key);
    if (!customer) {
      customer = await stripe.customers.create(
        { email: row.email, name: row.name, payment_method: "pm_card_visa", metadata: { seed: PREFIX, fixture_key: spec.key } },
        { idempotencyKey: `${PREFIX}_customer_${spec.key}` },
      );
    }
    if (!customer.invoice_settings?.default_payment_method) {
      // The attached method has its own id; pm_card_visa itself cannot be a default.
      const pms = await stripe.paymentMethods.list({ customer: customer.id, type: "card", limit: 1 });
      if (pms.data[0]) await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pms.data[0].id } });
    }
    const existing = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 10 });
    let sub = existing.data.find((s2) => s2.metadata?.seed === PREFIX && s2.metadata?.fixture_key === spec.key && s2.status !== "canceled");
    if (!sub) {
      sub = await stripe.subscriptions.create(
        { customer: customer.id, items: [{ price: price.id }], metadata: { seed: PREFIX, fixture_key: spec.key, talent_profile_id: row.talentId } },
        { idempotencyKey: `${PREFIX}_subscription_${spec.key}` },
      );
    }
    const periodEnd = (sub.items.data[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end
      ?? (sub as unknown as { current_period_end?: number }).current_period_end
      ?? Math.floor(Date.now() / 1000) + 2592000;
    await ins("public.talent_subscriptions", {
      id: sid,
      talent_profile_id: row.talentId,
      user_id: row.userId,
      stripe_subscription_id: sub.id,
      stripe_customer_id: customer.id,
      plan_key: spec.planKey,
      status: sub.status,
      current_period_end: new Date(periodEnd * 1000).toISOString(),
      stripe_price_id: price.id,
    });
    console.log(`[group6-fixtures] Stripe TEST ${spec.key}: customer ${customer.id}, subscription ${sub.id} on ${lookup}`);
  }
}

/** (b) a real PaymentIntent for the refundable booking, attached to OUR existing money row (never a second one). */
async function attachRefundablePaymentIntent(): Promise<string> {
  const stripe = await openStripe();
  const txn = id("txn:refundable");
  const cur = await q("select provider_metadata from public.booking_transactions where id = $1", [txn]);
  const existingPi = (cur.rows[0]?.provider_metadata as { payment_intent_id?: string } | null)?.payment_intent_id;
  if (existingPi) return existingPi;
  const found = await stripe.paymentIntents.search({ query: metaQuery("transaction_id", txn), limit: 1 });
  let intent = found.data[0];
  if (!intent) {
    intent = await stripe.paymentIntents.create(
      {
        amount: 80000,
        currency: "mxn",
        payment_method: "pm_card_visa",
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        description: `${PREFIX} refundable booking payment`,
        metadata: { transaction_id: txn, booking_id: id("booking:refundable"), seed: PREFIX },
      },
      { idempotencyKey: `${PREFIX}_pi_refundable` },
    );
  }
  if (intent.status !== "succeeded") die(`PaymentIntent ${intent.id} ended ${intent.status}`);
  await q(
    "update public.booking_transactions set provider_metadata = coalesce(provider_metadata, '{}'::jsonb) || $2::jsonb where id = $1",
    [txn, J({ payment_intent_id: intent.id })],
  );
  return intent.id;
}

/** --stripe --preflight: verify the key, list what exists, print what --apply --stripe would do. Writes nothing. */
async function stripePreflight() {
  const stripe = await openStripe(); // refuses unless sk_test_ AND livemode=false
  const account = await stripe.accounts.retrieveCurrent();
  console.log(`[group6-fixtures] preflight: key is sk_test_ and the API reports livemode=false. account ${account.id}, country ${account.country ?? "?"}`);
  const found = await stripe.prices.list({ lookup_keys: ALL_PLAN_LOOKUP_KEYS, limit: 20 });
  const prices: Record<string, string | null> = {};
  for (const k of ALL_PLAN_LOOKUP_KEYS) prices[k] = found.data.find((p) => p.lookup_key === k)?.id ?? null;
  const coupons: Record<string, boolean> = {};
  for (const c of TEST_COUPON_IDS) coupons[c] = await stripe.coupons.retrieve(c).then(() => true, () => false);
  const customers: Record<string, boolean> = {};
  for (const s of STRIPE_FIXTURE_SUBSCRIPTIONS) customers[s.key] = Boolean(await findCustomer(stripe, s.key));
  const pi = await stripe.paymentIntents.search({ query: metaQuery("transaction_id", id("txn:refundable")), limit: 1 });
  console.log("[group6-fixtures] TEST prices by lookup key:");
  for (const [k, v] of Object.entries(prices)) console.log(`  ${k.padEnd(38)} ${v ?? "missing"}`);
  console.log("[group6-fixtures] TEST coupons:");
  for (const [k, v] of Object.entries(coupons)) console.log(`  ${k.padEnd(38)} ${v ? "present" : "missing"}`);
  console.log("[group6-fixtures] --apply --stripe would:");
  for (const line of describeStripeApply({ prices, coupons, customers, paymentIntents: { refundable: pi.data.length > 0 } })) console.log(`  ${line}`);
  console.log("[group6-fixtures] preflight wrote nothing (search results can lag a minute behind creation).");
}

// ------------------------------------------------------------------ cleanup (FK-descendant purge, scoped to our ids)
const visited = new Set<string>();
let purged = 0;

async function hasIdPk(table: string): Promise<boolean> {
  const r = await q(
    `select 1 from information_schema.columns where table_schema = split_part($1,'.',1) and table_name = split_part($1,'.',2) and column_name = 'id'`,
    [table],
  );
  return (r.rowCount ?? 0) > 0;
}

async function childFks(table: string): Promise<Array<{ t: string; col: string; refcol: string }>> {
  const r = await q(
    `select c.conrelid::regclass::text as t, a.attname as col, fa.attname as refcol
       from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       join pg_attribute fa on fa.attrelid = c.confrelid and fa.attnum = c.confkey[1]
      where c.contype = 'f' and c.confrelid = $1::regclass and array_length(c.conkey, 1) = 1`,
    [table],
  );
  return r.rows as Array<{ t: string; col: string; refcol: string }>;
}

/** Delete rows of `table` whose `col` is in `ids`, children first. Only ever walks DOWN from our ids. */
async function purge(table: string, col: string, ids: string[], depth = 0): Promise<void> {
  if (!ids.length || depth > 8) return;
  const rows = (await hasIdPk(table))
    ? (await q(`select id::text as id from ${table} where ${col}::text = any($1::text[])`, [ids])).rows.map((r) => r.id as string)
    : [];
  if (rows.length) {
    for (const fk of await childFks(table)) {
      if (fk.refcol !== "id") continue;
      const key = `${fk.t}.${fk.col}<-${table}`;
      if (visited.has(`${key}:${rows.join(",")}`)) continue;
      visited.add(`${key}:${rows.join(",")}`);
      await purge(fk.t, fk.col, rows, depth + 1);
    }
  }
  const del = await q(`delete from ${table} where ${col}::text = any($1::text[])`, [ids]);
  purged += del.rowCount ?? 0;
}

async function cleanup() {
  const roots = ownedRootIds();
  // Stripe objects first (ids are in our own subscription row).
  if (args.stripe) {
    const subs = await q("select stripe_subscription_id, stripe_customer_id from public.talent_subscriptions where id = any($1::uuid[])", [[id("talent_subscription"), id("talent_subscription:owner")]]);
    const stripe = await openStripe();
    for (const r of subs.rows) {
      await stripe.subscriptions.cancel(r.stripe_subscription_id as string).catch(() => undefined);
      await stripe.customers.del(r.stripe_customer_id as string).catch(() => undefined);
    }
  }
  // Order matters only for readability; purge() handles descendants. Money rows hang off bookings.
  // The offer-pairing trigger forbids offer_pending with a NULL offer, which is what deleting the offer would cause.
  await q("update public.inquiries set status = 'closed', current_offer_id = null where id = any($1::uuid[])", [roots.inquiries]);
  await purge("public.talent_reviews", "id", roots.talent_reviews);
  await purge("public.cms_posts", "id", roots.cms_posts);
  await purge("public.inquiries", "id", roots.inquiries);
  await purge("public.agency_bookings", "id", roots.agency_bookings);
  await purge("public.talent_bookings", "id", roots.agency_bookings);
  await purge("public.orders", "id", roots.orders);
  await purge("public.user_notifications", "id", roots.user_notifications);
  await purge("public.guest_sessions", "id", roots.guest_sessions);
  await purge("public.customers", "id", roots.customers);
  await purge("public.media_assets", "id", roots.media_assets);
  await purge("public.talent_profiles", "id", roots.talent_profiles);
  await purge("public.agencies", "id", roots.agencies);
  await purge("public.profiles", "id", roots.profiles);
  const users = await q("delete from auth.users where id = any($1::uuid[])", [roots.profiles]);
  purged += users.rowCount ?? 0;
  console.log(`[group6-fixtures] cleanup deleted ${purged} rows (descendants of this seed's ids only)`);
}

const COUNT_TABLES = [
  "public.talent_profiles", "public.talent_sites", "public.talent_pages", "public.talent_offerings", "public.talent_offering_media",
  "public.agency_bookings", "public.talent_bookings", "public.booking_talent", "public.booking_transactions", "public.inquiries",
  "public.inquiry_offers", "public.inquiry_participants", "public.cms_posts", "public.talent_reviews", "public.media_assets",
  "public.customers", "public.client_profiles", "public.guest_sessions", "public.orders", "public.order_lines", "public.inquiry_messages", "public.agency_memberships", "public.agency_talent_roster", "public.profiles", "auth.users", "auth.identities", "public.agencies",
  "public.talent_subscriptions", "public.notification_dispatch_log", "public.user_notifications",
];

async function tableCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of COUNT_TABLES) out[t] = (await q(`select count(*)::int as n from ${t}`)).rows[0].n as number;
  return out;
}

async function leftovers(): Promise<number> {
  const roots = ownedRootIds();
  let n = 0;
  for (const [table, ids] of Object.entries(roots)) {
    const r = await q(`select count(*)::int as n from public.${table} where id = any($1::uuid[])`, [ids]);
    n += r.rows[0].n as number;
  }
  const u = await q("select count(*)::int as n from auth.users where id = any($1::uuid[])", [roots.profiles]);
  return n + (u.rows[0].n as number);
}

// ------------------------------------------------------------------ main
async function seedAll() {
  const clientEmail = EMAILS.client;
  const uLimpieza = await seedUser("limpieza", EMAILS.limpieza, "qa-fixture Limpieza Hogar", "talent");
  const uQuote = await seedUser("quote", EMAILS.quote, "qa-fixture Electricista", "talent");
  const uClient = await seedUser("client", clientEmail, "qa-fixture Cliente", "client");
  // Without a client_profiles row /client and /account bounce the user to /onboarding/role.
  // Second client for TUL-1242: everything paid, nothing owed (client one has owed work).
  const uClient2 = await seedUser("client2", EMAILS.client2, "qa-fixture Cliente Pagado", "client");
  await ins("public.client_profiles", { id: id("client_profile2"), user_id: uClient2, preferred_locale: "es" }, ["user_id"]);
  const uOwner = await seedUser("owner", EMAILS.owner, "qa-fixture Dueno", "talent");
  const ws = await seedWorkspace(uOwner);
  // The owner is also a talent (own profile, own site), like the QA-B7 account behind TUL-1255.
  const tOwner = await seedTalent(
    {
      key: "owner",
      profileCode: "TAL-96003",
      display: "qa-fixture Dueno Estudio",
      first: "Dueno",
      tagline: "Estudio y talento en una sola cuenta",
      slug: `${PREFIX}-owner`,
      taxonomySlug: "cleaner",
    },
    uOwner,
  );
  await ins("public.client_profiles", { id: id("client_profile"), user_id: uClient, preferred_locale: "es" }, ["user_id"]);

  const t1 = await seedTalent(
    {
      key: "limpieza",
      profileCode: "TAL-96001",
      display: "qa-fixture Limpieza Hogar",
      first: "Limpieza",
      tagline: "Limpieza de casa en tu domicilio",
      slug: `${PREFIX}-limpieza`,
      taxonomySlug: "cleaner",
    },
    uLimpieza,
  );
  const t2 = await seedTalent(
    {
      key: "quote",
      profileCode: "TAL-96002",
      display: "qa-fixture Electricista",
      first: "Electricista",
      tagline: "Instalaciones y reparaciones electricas",
      slug: `${PREFIX}-quote`,
      taxonomySlug: "electrician",
    },
    uQuote,
  );
  await seedMedia(t1);

  const o1 = await seedOffering(
    {
      key: "limpieza:casa", talentKey: "limpieza", title: "QA Limpieza de casa", titleEn: "QA House cleaning",
      description: "Visita de limpieza a tu domicilio. Precio fijo por visita.", priceType: "flat_package", priceDisplay: "exact",
      amountCents: 80000, bookingMode: "instant", visibility: "public", duration: 180, category: "Limpieza", sort: 0, images: [1],
    },
    t1,
  );
  await seedOffering(
    {
      key: "quote:instalacion", talentKey: "quote", title: "QA Instalacion de contacto", titleEn: "QA Outlet installation",
      description: "Instalacion de un contacto o apagador con material incluido.", priceType: "fixed", priceDisplay: "exact",
      amountCents: 45000, bookingMode: "instant", visibility: "public", duration: 60, category: "Electricidad", sort: 0, images: [2, 3],
    },
    t2,
  );
  await seedOffering(
    {
      key: "quote:tablero", talentKey: "quote", title: "QA Cambio de tablero", titleEn: "QA Panel replacement",
      description: "Se cotiza segun la visita.", priceType: "custom", priceDisplay: "quote",
      amountCents: null, bookingMode: "request", visibility: "public", duration: 240, category: "Electricidad", sort: 1, images: [2],
    },
    t2,
  );
  await seedOffering(
    {
      key: "quote:emergencia", talentKey: "quote", title: "QA Emergencia 24h", titleEn: "QA 24h emergency",
      description: "Atencion urgente; el precio se comparte al solicitar.", priceType: "flat_package", priceDisplay: "exact",
      amountCents: 90000, bookingMode: "request", visibility: "on_request", duration: 90, category: "Electricidad", sort: 2, images: [3],
    },
    t2,
  );

  // Client identity in the hub tenant (customers row cloned from the QA offer template so NOT NULL columns are right).
  const customerId = id("customer:client");
  await clone("public.customers", "s.id = 'ab93f2d1-141e-4fe7-a227-fb2aa48e0e33'", [], {
    id: customerId,
    tenant_id: HUB_TENANT_ID,
    email: clientEmail,
    display_name: "qa-fixture Cliente",
    user_id: uClient,
  });

  const now = new Date();
  const away = await seedBooking({
    key: "away", title: "QA Visita a domicilio (away)", startsAt: cancunInstant(now, 0, 15), endsAt: cancunInstant(now, 0, 17),
    bookingStatus: "confirmed", address: "Calle 12 #34, Col. Centro, Cancun", paid: false, amountCents: 80000, provider: "manual",
    clientUser: uClient, customerId, t1, t1User: uLimpieza,
  });
  const refundable = await seedBooking({
    key: "refundable", title: "QA Reserva pagada (reembolsable)", startsAt: cancunInstant(now, 1, 10), endsAt: cancunInstant(now, 1, 13),
    bookingStatus: "confirmed", address: "Av. Tulum 100, Cancun", paid: true, amountCents: 80000, provider: "stripe",
    clientUser: uClient, customerId, t1, t1User: uLimpieza,
  });
  const done = await seedBooking({
    key: "done", title: "QA Reserva completada", startsAt: cancunInstant(now, -5, 10), endsAt: cancunInstant(now, -5, 13),
    bookingStatus: "completed", address: "Av. Tulum 100, Cancun", paid: true, amountCents: 80000, provider: "manual",
    clientUser: uClient, customerId, t1, t1User: uLimpieza,
  });
  const done2 = await seedBooking({
    key: "done2", title: "QA Reserva completada 2", startsAt: cancunInstant(now, -6, 10), endsAt: cancunInstant(now, -6, 13),
    bookingStatus: "completed", address: "Av. Tulum 100, Cancun", paid: true, amountCents: 80000, provider: "manual",
    clientUser: uClient, customerId, t1, t1User: uLimpieza,
  });
  const done3 = await seedBooking({
    key: "done3", title: "QA Reserva completada 3", startsAt: cancunInstant(now, -7, 10), endsAt: cancunInstant(now, -7, 13),
    bookingStatus: "completed", address: "Av. Tulum 100, Cancun", paid: true, amountCents: 80000, provider: "manual",
    clientUser: uClient, customerId, t1, t1User: uLimpieza,
  });
  const customerId2 = id("customer:client2");
  await clone("public.customers", "s.id = 'ab93f2d1-141e-4fe7-a227-fb2aa48e0e33'", [], {
    id: customerId2,
    tenant_id: HUB_TENANT_ID,
    email: EMAILS.client2,
    display_name: "qa-fixture Cliente Pagado",
    user_id: uClient2,
  });
  const paid2 = await seedBooking({
    key: "paid2", title: "QA Reserva pagada (cliente 2)", startsAt: cancunInstant(now, -8, 10), endsAt: cancunInstant(now, -8, 13),
    bookingStatus: "completed", address: "Av. Tulum 100, Cancun", paid: true, amountCents: 80000, provider: "manual",
    clientUser: uClient2, customerId: customerId2, t1, t1User: uLimpieza, clientName: "qa-fixture Cliente Pagado", clientEmail: EMAILS.client2,
  });
  const payOrder = await seedPayLaterOrder(customerId);
  const payLater = await seedBooking({
    key: "paylater", title: "QA Limpieza pendiente de pago", startsAt: cancunInstant(now, 3, 11), endsAt: cancunInstant(now, 3, 14),
    bookingStatus: "confirmed", address: "Calle 8 #21, Col. Centro, Cancun", paid: false, amountCents: 80000, provider: "manual",
    clientUser: uClient, customerId, t1, t1User: uLimpieza, orderId: payOrder,
  });
  await seedPayLaterLine(payOrder, payLater, t1);
  const agencyOnly = await seedBooking({
    key: "agencyonly", title: "QA Reserva de agencia (sin fila de talento)", startsAt: cancunInstant(now, 0, 9), endsAt: cancunInstant(now, 0, 10),
    bookingStatus: "confirmed", address: "Av. Tulum 100, Cancun", paid: false, amountCents: 50000, provider: "manual",
    clientUser: uClient, customerId, t1, t1User: uLimpieza, skipTalentBooking: true,
  });
  const chain = await seedOfferChain(t1, uLimpieza, uClient, customerId, o1);
  await seedMessages(chain.inq, chain.offer, uClient, uLimpieza);
  await seedTicketBells(uLimpieza);
  const guest = await seedGuestThread(t1, uLimpieza);
  await seedReviews(t1, uClient, [done, done2, done3]);
  await seedPosts(ws, uOwner);
  let pi: string | null = null;
  if (args.stripe) {
    pi = await attachRefundablePaymentIntent();
    await seedStripePlans([
      { key: "limpieza", talentId: t1, userId: uLimpieza, email: EMAILS.limpieza, name: "qa-fixture Limpieza Hogar" },
      { key: "owner", talentId: tOwner, userId: uOwner, email: EMAILS.owner, name: "qa-fixture Dueno Estudio" },
    ]);
  }
  return { guest, uClient2, paid2, t1, t2, tOwner, uLimpieza, uQuote, uClient, uOwner, ws, payLater, agencyOnly, away, refundable, done, done2, done3, ...chain, pi };
}

function printReport(r?: Awaited<ReturnType<typeof seedAll>>) {
  console.log("\n[group6-fixtures] created (new rows):");
  for (const [t, ids] of Object.entries(created)) console.log(`  ${t.padEnd(36)} ${ids.length}`);
  const ex = Object.entries(existed);
  if (ex.length) {
    console.log("[group6-fixtures] already present (left untouched):");
    for (const [t, ids] of ex) console.log(`  ${t.padEnd(36)} ${ids.length}`);
  }
  if (r) {
    console.log("\n[group6-fixtures] ids:");
    console.log(`  T1 talent_profile   ${r.t1}   (TAL-96001, site slug ${PREFIX}-limpieza)`);
    console.log(`  T2 talent_profile   ${r.t2}   (TAL-96002, site slug ${PREFIX}-quote)`);
    console.log(`  client user         ${r.uClient}  (${EMAILS.client})`);
    console.log(`  T1 user / T2 user   ${r.uLimpieza} / ${r.uQuote}`);
    console.log(`  sent offer          ${r.offer} (inquiry ${r.inq})`);
    console.log(`  bookings            away ${r.away} | refundable ${r.refundable} | completed ${r.done}`);
    console.log(`  guest inquiry ${r.guest.inq} (guest_session ${r.guest.gs}); link: node scripts/print-group6-guest-thread-link.mjs`);
    console.log(`  client 2 (all paid) user ${r.uClient2} | booking ${r.paid2}`);
    console.log(`  owner talent_profile ${r.tOwner} (TAL-96003)`);
    console.log(`  owner user / workspace ${r.uOwner} / ${r.ws} (slug ${PREFIX}-ws)`);
    console.log(`  pay-later booking   ${r.payLater} | agency-only booking ${r.agencyOnly}`);
    console.log(`  stripe test PI      ${r.pi ?? "(none: pass --stripe with an sk_test_ key; refund click will fail at Stripe without it)"}`);
  }
}

/** What Verify will see, read back inside the same transaction. Counts only, no secrets. */
async function verifySummary(r: Awaited<ReturnType<typeof seedAll>>) {
  const one = async (sql: string, p: unknown[] = []) => (await q(sql, p)).rows[0] as Row;
  const t1 = r.t1;
  const roster = await one("select count(*)::int n from public.agency_talent_roster where talent_profile_id = $1 and status = 'active'", [t1]);
  const t1Services = await one("select count(*)::int n from public.talent_offerings where talent_profile_id = $1 and status = 'published' and visibility = 'public'", [t1]);
  const t2Services = await one("select count(*)::int n, count(*) filter (where price_display = 'quote')::int quote, count(*) filter (where visibility = 'on_request')::int on_request from public.talent_offerings where talent_profile_id = $1", [r.t2]);
  const imgs = await one("select count(*)::int n from public.talent_offering_media m join public.talent_offerings o on o.id = m.offering_id where o.talent_profile_id in ($1,$2)", [t1, r.t2]);
  const rev = await one("select rating_count, rating_avg from public.talent_profiles where id = $1", [t1]);
  const verified = await one("select count(*)::int n from public.talent_reviews where talent_profile_id = $1 and verified_paid", [t1]);
  const tx = await one("select count(*)::int n, count(*) filter (where status = 'paid')::int paid from public.booking_transactions where booking_id = any($1::uuid[])", [[r.refundable, r.done, r.done2, r.done3]]);
  const owed = await one("select count(*)::int n from public.agency_bookings b join public.orders o on o.id = b.order_id where b.id = $1 and b.payment_status = 'unpaid' and o.status = 'pending_payment'", [r.payLater]);
  const agencyOnly = await one("select (select count(*)::int from public.agency_bookings where id = $1) ab, (select count(*)::int from public.talent_bookings where id = $1) tb, (select count(*)::int from public.booking_talent where booking_id = $1) bt", [r.agencyOnly]);
  const msgs = await one("select count(*)::int n from public.inquiry_messages where inquiry_id = $1 and deleted_at is null", [r.inq]);
  const ws = await one("select (select count(*)::int from public.agency_memberships where tenant_id = $1 and profile_id = $2 and status = 'active') m, (select preferred_currency from public.agencies where id = $1) cur, (select app_role::text from public.profiles where id = $2) role", [r.ws, r.uOwner]);
  const guestMsgs = await one("select count(*)::int n from public.inquiry_messages where inquiry_id = $1 and thread_type = 'private' and deleted_at is null", [r.guest.inq]);
  const bells = await one("select count(*)::int n from public.user_notifications where user_id = $1 and kind = 'ticket'", [r.uLimpieza]);
  const lookup = await q("select public.talent_site_subdomain_lookup($1) as l", [`${PREFIX}-limpieza`]).catch(() => null);
  console.log("\n[group6-fixtures] read-back (what Verify will see):");
  console.log(`  T1 active hub roster rows ${roster.n} | published public services T1=${t1Services.n} (single-service site: must be 1)`);
  console.log(`  T2 services ${t2Services.n} (quote-only ${t2Services.quote}, on_request ${t2Services.on_request}) | offering photo links ${imgs.n}`);
  console.log(`  T1 rating_count ${rev.rating_count} avg ${rev.rating_avg} | verified-paid reviews ${verified.n}/3`);
  console.log(`  paid transactions on the four paid bookings ${tx.paid}/${tx.n}`);
  console.log(`  pay-later booking unpaid with pending_payment order ${owed.n}/1 | agency-only booking: agency_bookings ${agencyOnly.ab}, talent_bookings ${agencyOnly.tb} (must be 0), booking_talent ${agencyOnly.bt}`);
  console.log(`  offer thread messages ${msgs.n} | owner membership ${ws.m} role ${ws.role} workspace currency ${ws.cur} | ticket bells ${bells.n} | guest thread messages ${guestMsgs.n}`);
  console.log(`  site lookup rpc ${lookup ? JSON.stringify(lookup.rows[0]?.l ?? null).slice(0, 160) : "(rpc unavailable)"}`);
}

async function main() {
  if (args.preflight) {
    await stripePreflight();
    return;
  }
  const mode = args.cleanup ? (args.apply ? "cleanup-apply" : "cleanup-plan") : args.selftest ? "selftest" : args.apply ? "apply" : "plan";
  console.log(`[group6-fixtures] target OK (staging fxlankepwnvelxjrahwk). mode=${mode}${password ? "" : " (no QA_FIXTURE_PASSWORD: logins get no password)"}`);

  if (mode === "plan" || mode === "cleanup-plan") {
    await q("begin read only");
    await assertStagingMarker();
    const roots = ownedRootIds();
    for (const [table, ids] of Object.entries(roots)) {
      const r = await q(`select count(*)::int as n from public.${table} where id = any($1::uuid[])`, [ids]);
      console.log(`  ${table.padEnd(18)} ${r.rows[0].n}/${ids.length} fixture root rows present`);
    }
    // Schema check: every table/column the seed writes must exist in the staging schema.
    let missing = 0;
    for (const [qualified, cols] of Object.entries(SEED_COLUMNS)) {
      const [schema, table] = qualified.split(".");
      const have = new Set(
        (await q("select column_name from information_schema.columns where table_schema = $1 and table_name = $2", [schema, table])).rows.map((r) => r.column_name as string),
      );
      const gone = have.size === 0 ? ["(table missing)"] : cols.filter((c) => !have.has(c));
      if (gone.length) {
        missing += gone.length;
        console.log(`  SCHEMA MISSING ${qualified}: ${gone.join(", ")}`);
      }
    }
    console.log(`  schema check: ${Object.keys(SEED_COLUMNS).length} tables, ${missing === 0 ? "every column the seed writes exists" : `${missing} MISSING`}`);
    if (missing) process.exitCode = 1;
    console.log(mode === "plan" ? "Dry run only: nothing written. Use --selftest to validate against the schema (rolled back), --apply to write." : "Cleanup plan only: nothing deleted. Add --apply to delete.");
    await q("rollback");
    return;
  }

  await q("begin");
  try {
    await assertStagingMarker();
    if (mode === "cleanup-apply") {
      await cleanup();
      const left = await leftovers();
      if (left) throw new Error(`${left} fixture root rows remain after cleanup`);
      await q("commit");
      console.log("[group6-fixtures] cleanup committed; 0 fixture root rows remain");
      return;
    }
    const before = mode === "selftest" ? await tableCounts() : null;
    // If the fixtures are already committed, cleanup removes them (then rolls back), so the row-count drift check only applies to a clean start.
    const startedClean = mode === "selftest" ? (await leftovers()) === 0 : true;
    const r = await seedAll();
    printReport(r);
    await verifySummary(r);
    if (mode === "selftest" && before) {
      await cleanup();
      const after = await tableCounts();
      const drift = !startedClean ? [] : COUNT_TABLES.filter((t) => before[t] !== after[t]).map((t) => `${t} ${before[t]} -> ${after[t]}`);
      if (drift.length) console.log(`[group6-fixtures] selftest: row-count drift after cleanup (cleanup missed or over-deleted): ${drift.join("; ")}`);
      else if (!startedClean) console.log("[group6-fixtures] selftest: fixtures were already committed, so the row-count drift check was skipped (cleanup of the existing rows ran and was rolled back)");
      else console.log("[group6-fixtures] selftest: every watched table is back to its starting row count");
      const left = (await leftovers()) + drift.length;
      console.log(`[group6-fixtures] selftest: cleanup left ${left} fixture root rows (expected 0)`);
      await q("rollback");
      if (left) process.exitCode = 1;
      else console.log("[group6-fixtures] selftest OK; everything rolled back, nothing persisted");
      return;
    }
    await q("commit");
    console.log("\n[group6-fixtures] COMMITTED to staging.");
  } catch (e) {
    await q("rollback").catch(() => undefined);
    throw e;
  }
}

try {
  await main();
} catch (e) {
  console.error(`[group6-fixtures] FAILED (rolled back): ${e instanceof Error ? e.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  if (!args.preflight) await client.end();
}

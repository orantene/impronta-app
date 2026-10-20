/**
 * Pure op builders shared by the failed-cards fixture planners. An "op" is one intended write:
 *   { fx, kind: "insert" | "clone" | "authUser" | "update" | "call", table, key, id?, row?, set?, conflict?, template? }
 * The runner (scripts/seed-failed-cards-fixtures.mts) executes them in order; the guards check them first.
 */
import { EMAILS, HUB_TENANT_ID, PREFIX, stableId } from "./group6-fixtures.mjs";
import { fcId } from "./failed-cards-guards.mjs";

export { HUB_TENANT_ID };

/** Group-6 rows this seed reads as templates or links to (all deterministic Group-6 ids, never modified). */
export const G6 = {
  t1: stableId("talent:limpieza"),
  t2: stableId("talent:quote"),
  tOwner: stableId("talent:owner"),
  uT1: stableId("user:limpieza"),
  uT2: stableId("user:quote"),
  uOwner: stableId("user:owner"),
  uClient: stableId("user:client"),
  ws: stableId("workspace"),
  membership: stableId("membership:owner"),
  customer: stableId("customer:client"),
  inqOffer: stableId("inquiry:offer"),
  inqGuest: stableId("inquiry:guest"),
  offerSent: stableId("offer:sent"),
  offerLine: stableId("offer_line:1"),
  msgOffer: stableId("msg:offer"),
  msgText: stableId("msg:client"),
  msgGuest: stableId("msg:guest:1"),
  reqGroupOffer: stableId("reqgroup:offer"),
  reqGroupGuest: stableId("reqgroup:guest"),
  partTalent: stableId("participant:talent"),
  partClient: stableId("participant:client"),
  guestPartTalent: stableId("participant:guest:talent"),
  guestPartClient: stableId("participant:guest:client"),
  media2: stableId("media:2"),
  clientEmail: EMAILS.client,
};

/** The Group-6 rows that must exist before this seed runs (refuse otherwise). */
export const G6_REQUIRED = {
  "public.talent_profiles": [G6.t1, G6.t2, G6.tOwner],
  "public.profiles": [G6.uT1, G6.uT2, G6.uOwner, G6.uClient],
  "public.agencies": [G6.ws],
  "public.inquiries": [G6.inqOffer, G6.inqGuest],
  "public.inquiry_offers": [G6.offerSent],
  "public.inquiry_messages": [G6.msgOffer, G6.msgText, G6.msgGuest],
  "public.customers": [G6.customer],
};

/** Three public stock photos already in staging storage (the same ones the Group-6 seed links). */
export const STOCK_PATHS = [
  "tenant/a2968a2e-1ebd-48c0-a04f-b53cede55c1b/stock/3e154cfd-b23e-44b3-ae55-5450382582be.jpg",
  "tenant/a2968a2e-1ebd-48c0-a04f-b53cede55c1b/stock/afdcd815-d1dc-4c4d-9441-1caa5cceb599.jpg",
  "tenant/a2968a2e-1ebd-48c0-a04f-b53cede55c1b/stock/3167c48c-b4f1-4729-9551-01f09df1daf3.jpg",
];
export const STAGING_STORAGE_PUBLIC = "https://fxlankepwnvelxjrahwk.supabase.co/storage/v1/object/public/media-public";

export const fcEmail = (tag) => `${PREFIX}-${tag}@impronta.test`;
export const fcBotEmail = (tag) => `tulalaqa+${PREFIX}-${tag}@mail.grokbot.com`;

/** Mon-Sat 09:00-18:00 (keys 0 = Sunday .. 6 = Saturday), minutes from midnight. */
export const MON_SAT_9_18 = {
  "0": [],
  "1": [{ startMin: 540, endMin: 1080 }],
  "2": [{ startMin: 540, endMin: 1080 }],
  "3": [{ startMin: 540, endMin: 1080 }],
  "4": [{ startMin: 540, endMin: 1080 }],
  "5": [{ startMin: 540, endMin: 1080 }],
  "6": [{ startMin: 540, endMin: 1080 }],
};

export const J = (v) => JSON.stringify(v);
export const isoDays = (now, n) => new Date(now.getTime() + n * 86400000).toISOString();
export const isoMinutes = (now, n) => new Date(now.getTime() + n * 60000).toISOString();

export function insert(fx, table, key, row, conflict = ["id"]) {
  return { fx, kind: "insert", table, key, id: row.id ?? null, row, conflict };
}

/** Copy a template row (json_populate_record keeps every NOT NULL default right) with overrides. */
export function clone(fx, table, key, templateId, row, opts = {}) {
  return { fx, kind: "clone", table, key, id: row.id, row, template: { id: templateId, ...opts } };
}

export function update(fx, table, key, id, set) {
  return { fx, kind: "update", table, key, id, set };
}

/**
 * A login (auth.users + identity; the on_auth_user_created trigger makes the profiles row), then the
 * profile set up. `confirmed=false` leaves email_confirmed_at NULL; `needsPassword` makes the runner
 * refuse an --apply without QA_FIXTURE_PASSWORD.
 */
export function userOps(fx, key, { email, name, role, confirmed = true, needsPassword = false, displayName }) {
  const id = fcId(`user:${key}`);
  return [
    { fx, kind: "authUser", table: "auth.users", key: `user:${key}`, id, row: { email, name, confirmed, needsPassword } },
    update(fx, "public.profiles", `profile:${key}`, id, {
      display_name: displayName === undefined ? name : displayName,
      app_role: role,
      account_status: "active",
      is_test_account: true,
    }),
  ];
}

/**
 * A talent profile (+ optional login, site, home page, hours, primary taxonomy, extra roster rows).
 * `trees` = { shell(displayName), home(displayName, tagline) } from the app's default-max-site-trees.
 */
export function talentOps(fx, key, spec, { trees, now }) {
  const ops = [];
  const tid = fcId(`talent:${key}`);
  let userId = null;
  if (spec.user) {
    ops.push(...userOps(fx, key, spec.user));
    userId = fcId(`user:${key}`);
  }
  const nowIso = now.toISOString();
  ops.push(
    insert(fx, "public.talent_profiles", `talent:${key}`, {
      id: tid,
      user_id: userId,
      profile_code: spec.code,
      public_slug_part: spec.code,
      display_name: spec.display,
      first_name: spec.first ?? spec.display.split(" ")[0],
      profile_kind: "person",
      short_bio: spec.tagline,
      preferred_locale: "es",
      default_currency: "MXN",
      talent_plan_key: spec.plan ?? "talent_portfolio",
      workflow_status: spec.workflow ?? "approved",
      visibility: "public",
      is_publicly_hidden: false,
      is_test_account: spec.testAccount ?? true,
      is_demo: false,
      ...(spec.agencyId ? { created_by_agency_id: spec.agencyId } : {}),
      ...(spec.bookingTerms ? { booking_terms: J(spec.bookingTerms) } : {}),
      ...(spec.country ? { home_country_text: spec.country } : {}),
      updated_at: nowIso,
    }),
  );
  if (spec.site) {
    const shell = trees.shell(spec.display);
    const home = trees.home(spec.display, spec.tagline);
    ops.push(
      insert(fx, "public.talent_sites", `site:${key}`, {
        id: fcId(`site:${key}`),
        talent_profile_id: tid,
        site_kind: "talent_personal",
        status: "published",
        site_slug: `${PREFIX}-${spec.site.slug}`,
        shell_tree: J(shell),
        shell_published: J(shell),
        published_at: nowIso,
        site_published_at: nowIso,
        version: 1,
        draft_updated_at: nowIso,
        accepting_bookings: true,
        accepting_inquiries: true,
        ...(spec.site.extra ?? {}),
      }, ["talent_profile_id"]),
      insert(fx, "public.talent_pages", `page:${key}:home`, {
        id: fcId(`page:${key}:home`),
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
        published_at: nowIso,
      }, ["talent_profile_id", "slug"]),
    );
  }
  if (spec.hours) {
    ops.push(
      insert(fx, "public.talent_booking_hours", `hours:${key}`, {
        talent_profile_id: tid,
        tenant_id: spec.hours.tenantId,
        timezone: "America/Cancun",
        weekly: J(MON_SAT_9_18),
        exceptions: J([]),
        slot_minutes: 30,
        buffer_before_min: 0,
        buffer_after_min: 0,
        min_notice_min: 60,
        horizon_days: 60,
      }, ["talent_profile_id"]),
    );
  }
  if (spec.termId) {
    ops.push(
      insert(fx, "public.talent_profile_taxonomy", `taxonomy:${key}`, {
        talent_profile_id: tid,
        taxonomy_term_id: spec.termId,
        is_primary: true,
        relationship_type: "primary_role",
        display_order: 0,
        tenant_id: HUB_TENANT_ID,
      }, ["talent_profile_id", "taxonomy_term_id"]),
    );
  }
  for (const r of spec.roster ?? []) ops.push(rosterOp(fx, `${key}:${r.tag}`, tid, r));
  return { ops, tid, userId };
}

export function rosterOp(fx, key, talentId, r) {
  return insert(fx, "public.agency_talent_roster", `roster:${key}`, {
    id: fcId(`roster:${key}`),
    tenant_id: r.tenantId,
    talent_profile_id: talentId,
    source_type: r.sourceType ?? "agency_added",
    status: "active",
    agency_visibility: r.visibility ?? "site_visible",
    talent_site_hidden: r.siteHidden ?? false,
    direct_booking_enabled: r.directBooking ?? true,
    is_primary: r.primary ?? false,
  });
}

export function mediaOp(fx, key, { tenantId, talentId, n }) {
  return insert(fx, "public.media_assets", `media:${key}`, {
    id: fcId(`media:${key}`),
    owner_talent_profile_id: talentId,
    bucket_id: "media-public",
    storage_path: STOCK_PATHS[n % STOCK_PATHS.length],
    variant_kind: "original",
    approval_state: "approved",
    tenant_id: tenantId,
    purpose: "cms",
    alt: `${PREFIX} stock photo ${n + 1}`,
    mime_type: "image/jpeg",
    asset_kind: "image",
  });
}

export function offeringOps(fx, key, spec) {
  const oid = fcId(`offering:${key}`);
  const ops = [
    insert(fx, "public.talent_offerings", `offering:${key}`, {
      id: oid,
      talent_profile_id: spec.talentId,
      tenant_id: spec.tenantId,
      kind: spec.kind ?? "service",
      title: spec.title,
      description: spec.description,
      price_type: spec.amountCents == null ? "custom" : "flat_package",
      price_display: spec.amountCents == null ? "quote" : "exact",
      amount_cents: spec.amountCents,
      currency: "MXN",
      booking_mode: spec.bookingMode ?? "instant",
      allow_pay_in_person: true,
      duration_minutes: spec.duration,
      category: spec.category ?? "Limpieza",
      status: spec.status ?? "published",
      visibility: spec.visibility ?? "public",
      moderation_state: "approved",
      is_featured: false,
      sort_order: spec.sort ?? 0,
      attributes: J({ where: ["client"] }),
      title_i18n: J({ es: spec.title, en: spec.titleEn }),
      owner_kind: "talent",
      reserve_mode: "full",
      cancellation_hours: spec.cancellationHours ?? 24,
    }),
  ];
  for (const m of spec.mediaKeys ?? []) {
    ops.push(insert(fx, "public.talent_offering_media", `offering_media:${key}:${m}`, { offering_id: oid, media_asset_id: fcId(`media:${m}`), sort_order: 0 }, ["offering_id", "media_asset_id"]));
  }
  return { ops, oid };
}

/** A builder container wrapping children (a bare top-level section renders as empty: see default-max-site-trees). */
export function containerNode(id, children) {
  return { id, kind: "container", props: { layout: "stack", gap: "m", align: "center" }, children };
}

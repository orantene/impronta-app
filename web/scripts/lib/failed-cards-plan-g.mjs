/**
 * Pure planners for the G1-G5 fixtures (QA Conductor ask, 2026-10-19), all on the F3 studio workspace
 * `qa-fixture-g6-studio` (G5 adds one free-plan twin). Same rules as the F-fixtures: additive, every id
 * `fcId(key)`, every slug `qa-fixture-g6-*`, every mailbox `qa-fixture-g6-*@impronta.test`.
 *
 *   G1  QR-menu dish priced only by size (2 sizes, 2 MXN prices)     #4108 / TUL-1330
 *   G2  one product with stock = 1 (capacity pool of 1 unit)         #4099 double-order race
 *   G3  second staff login (role `manager`: cannot refund)           #4091 / #4096
 *   G4  ticketed event, 1 night, capacity 2, + a promo with 1 use    #4090 / TUL-940
 *   G5  free-plan workspace, owner can start a paid Checkout         #4088 / TUL-830
 *
 * Service copy (titles, descriptions, categories, tier labels) never says QA / test / E2E: public loaders
 * hide those on test accounts. The slug columns keep the qa-fixture-g6 prefix (the guards require it).
 */
import { PREFIX } from "./group6-fixtures.mjs";
import { fcId } from "./failed-cards-guards.mjs";
import { G6, J, clone, fcEmail, insert, isoDays, userOps } from "./failed-cards-ops.mjs";
import { workspaceOps } from "./failed-cards-plan-sites.mjs";

export const G_FIXTURES = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"];
export const G_PASSWORD_ENV = "QA_FIXTURE_PASSWORD";
export const G_EVENT_SLUG = `${PREFIX}-noche-de-salsa`;
export const G_PROMO_CODE = "SALSA10";
export const G_EVENT_SEATS = 2;
export const G_FREE_SLUG = `${PREFIX}-estudio-aurora`;

/** A workspace-owned Menu item (owner_kind 'workspace', no talent), shaped like menu-import's applyParsedMenu patch. */
export function menuItem(fx, key, ws, spec) {
  const id = fcId(`offering:${key}`);
  return insert(fx, "public.talent_offerings", `offering:${key}`, {
    id,
    tenant_id: ws,
    owner_kind: "workspace",
    talent_profile_id: null,
    kind: spec.kind ?? "product",
    title: spec.title,
    description: spec.description,
    title_i18n: J({ es: spec.title, en: spec.titleEn }),
    description_i18n: J({ es: spec.description, en: spec.descriptionEn }),
    category: spec.category,
    amount_cents: spec.amountCents ?? null,
    currency: "MXN",
    price_type: spec.priceType ?? "flat_package",
    price_display: spec.amountCents == null ? "quote" : "exact",
    booking_mode: spec.bookingMode ?? "request",
    status: "published",
    moderation_state: "approved",
    visibility: "public",
    is_featured: false,
    sort_order: spec.sort ?? 0,
    attributes: J({}),
    ...(spec.poolId ? { capacity_pool_id: spec.poolId, inventory_qty: spec.stock } : {}),
    ...(spec.extra ?? {}),
  });
}

/** G1 (#4108 / TUL-1330): a dish with NO base price and two size options, like a menu-imported tier-only dish. */
export function planG1(ws) {
  const fx = "G1";
  const item = menuItem(fx, "g1-cafe", ws, {
    title: "Café con leche",
    titleEn: "Latte",
    description: "Café de la casa con leche vaporizada.",
    descriptionEn: "House coffee with steamed milk.",
    category: "Bebidas",
    amountCents: null,
    sort: 10,
  });
  const sizes = [
    { tag: "chico", label: "Chico", cents: 4500 },
    { tag: "grande", label: "Grande", cents: 6500 },
  ];
  return [
    item,
    ...sizes.map((s, i) =>
      insert(fx, "public.talent_offering_variants", `variant:g1-${s.tag}`, {
        id: fcId(`variant:g1-${s.tag}`),
        offering_id: item.id,
        label: s.label,
        amount_cents: s.cents,
        sort_order: i,
      }),
    ),
  ];
}

/** G2 (#4099): a priced product with exactly one unit in a capacity pool, so two simultaneous orders race for it. */
export function planG2(ws) {
  const fx = "G2";
  const offeringId = fcId("offering:g2-pay");
  const poolId = fcId("pool:g2-pay");
  return [
    // The pool first: the offering row points at it (capacity_pool_id FK). subject_id has no FK.
    insert(fx, "public.capacity_pools", "pool:g2-pay", {
      id: poolId,
      tenant_id: ws,
      subject_kind: "offering",
      subject_id: offeringId,
      pool_key: "default",
      units_total: 1,
      overbook_units: 0,
      hold_ttl_seconds: 900,
      unit_label: "unit",
      is_active: true,
      pool_path: [], // overwritten by the capacity_pools_set_path trigger, as upsert_capacity_pool does
    }),
    menuItem(fx, "g2-pay", ws, {
      title: "Pay de queso, pieza única",
      titleEn: "Cheesecake, single piece",
      description: "Pay de queso con frutos rojos. Solo queda una pieza.",
      descriptionEn: "Cheesecake with red berries. Only one piece left.",
      category: "Postres",
      amountCents: 18000,
      bookingMode: "instant",
      sort: 20,
      poolId,
      stock: 1,
    }),
  ];
}

/** G3 (#4091 / #4096): a second staff login on the studio. `manager` holds no refund capability. */
export function planG3(at, ws) {
  const fx = "G3";
  const key = "g3-manager";
  const iso = at.toISOString();
  const userId = fcId(`user:${key}`);
  return [
    // needsPassword: the runner takes QA_FIXTURE_PASSWORD from the environment; it is never in a row or a log.
    ...userOps(fx, key, { email: fcEmail("studio-manager"), name: "Marcos Gerente", role: "agency_staff", needsPassword: true }),
    clone(fx, "public.agency_memberships", `membership:${key}`, G6.membership, {
      id: fcId(`membership:${key}`), tenant_id: ws, profile_id: userId, role: "manager", status: "active", invited_by: null,
      accepted_at: iso, created_at: iso, updated_at: iso,
    }),
  ];
}

/** G4 (#4090 / TUL-940): a published one-night ticketed event with 2 seats, one tier, and a 1-use promo code. */
export function planG4(now, ws) {
  const fx = "G4";
  const title = "Noche de Salsa en vivo";
  const iso = now.toISOString();
  const offeringId = fcId("offering:g4-event");
  const eventId = fcId("event:g4");
  const sessionId = fcId("session:g4");
  const tierId = fcId("variant:g4-general");
  const startsAt = isoDays(now, 21);
  const endsAt = new Date(new Date(startsAt).getTime() + 3 * 3600000).toISOString();
  return [
    // The event's catalog row, shaped like createEventWithOffering (kind package, workspace-owned, no talent).
    insert(fx, "public.talent_offerings", "offering:g4-event", {
      id: offeringId, tenant_id: ws, owner_kind: "workspace", talent_profile_id: null, kind: "package", title,
      description: "Música en vivo y baile. Cupo limitado.", currency: "MXN", amount_cents: 25000, price_type: "flat_package", price_display: "exact",
      booking_mode: "request", status: "published", moderation_state: "approved", visibility: "public", category: "Eventos",
      title_i18n: J({ es: title, en: "Live Salsa Night" }), attributes: J({}),
    }),
    insert(fx, "public.events", "event:g4", {
      id: eventId, tenant_id: ws, slug: G_EVENT_SLUG, title, description: "Música en vivo y baile. Cupo limitado a 2 lugares.",
      status: "published", published_at: iso, offering_id: offeringId, admission_kind: "ticket", doors_offset_minutes: 30,
      refunds_open: true, refund_policy_key: "manual",
    }),
    insert(fx, "public.sessions", "session:g4", {
      id: sessionId, tenant_id: ws, event_id: eventId, offering_id: offeringId, starts_at: startsAt, ends_at: endsAt, status: "scheduled",
    }),
    // A tier IS a catalog variant; its pool is resolved per night as (session_tier, session.id, pool_key).
    insert(fx, "public.talent_offering_variants", "variant:g4-general", {
      id: tierId, offering_id: offeringId, label: "Entrada general", amount_cents: 25000, sort_order: 0,
      pool_key: "entrada_general", min_per_order: 1, max_per_order: G_EVENT_SEATS, is_hidden: false,
    }),
    insert(fx, "public.capacity_pools", "pool:g4-general", {
      id: fcId("pool:g4-general"), tenant_id: ws, subject_kind: "session_tier", subject_id: sessionId, pool_key: "entrada_general",
      units_total: G_EVENT_SEATS, overbook_units: 0, hold_ttl_seconds: 900, unit_label: "seat", is_active: true, pool_path: [],
    }),
    insert(fx, "public.tenant_promo_codes", "promo:g4-salsa", {
      id: fcId("promo:g4-salsa"), tenant_id: ws, event_id: eventId, code: G_PROMO_CODE, name: "Descuento de bienvenida",
      kind: "percent", offer_kind: "percent", value: 10, max_redemptions: 1, per_customer_limit: 1, scope_kind: "all", audience: "public",
      unlock: "code", applies_on: "purchase", is_active: true, is_draft: false, is_paused: false, show_on_site: false,
    }),
  ];
}

/** G5 (#4088 / TUL-830): a free-plan workspace with the studio owner as owner and no subscription row, so Checkout (with the renewal consent) is reachable. */
export function planG5(now, { ownerUser }) {
  const fx = "G5";
  const w = workspaceOps(fx, "g5-free", { slug: G_FREE_SLUG, name: "Estudio Aurora Cancún", ownerUser, plan: "free", at: now });
  return { ops: w.ops, ws: w.ws };
}

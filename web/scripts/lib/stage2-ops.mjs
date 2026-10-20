/**
 * Pure op builders for the Stage 2 seed. An "op" is one intended write (same shapes the #4048 runner executes):
 *   insert | clone | authUser | update | pin, plus { fx, table, key, id?, row?, set?, conflict?, template? }.
 * Ids are s2Id(key). `insert` / `clone` / `update` and the Group-6 template ids come from #4048 unchanged.
 */
import { createHash } from "node:crypto";
import { clone, insert, update, J, isoDays, G6, HUB_TENANT_ID } from "./failed-cards-ops.mjs";
import { s2Id } from "./stage2-guards.mjs";

export { clone, insert, update, J, isoDays, G6, HUB_TENANT_ID, s2Id };

export const email = (tag) => `s2-${tag}@example.test`;

/** Staging suffix of every fixture subdomain (same wildcard F3 uses). */
export const STAGING_HOST_SUFFIX = "staging.tulala.digital";

/** A deterministic, opaque-looking token for a visit (not a secret: staging fixtures only). */
export const visitToken = (key) => `s2v-${createHash("sha256").update(`visit:${key}`).digest("hex").slice(0, 28)}`;

/**
 * A login. `secretKey` names the generated password in the local seed config; the password itself is NEVER in an op.
 * status: 'active' (default), 'invited' (pending invitee: unconfirmed), 'suspended'.
 */
export function userOps(fx, key, { email: mail, name, confirmed = true }) {
  const id = s2Id(`user:${key}`);
  return [
    { fx, kind: "authUser", table: "auth.users", key: `user:${key}`, id, row: { email: mail, name, confirmed, secretKey: key } },
    update(fx, "public.profiles", `profile:${key}`, id, { display_name: name, app_role: "agency_staff", account_status: "active", is_test_account: true }),
  ];
}

export function membershipOp(fx, key, ws, userKey, { role, status = "active" }, at) {
  const iso = at.toISOString();
  const invited = status === "invited";
  return clone(fx, "public.agency_memberships", `membership:${key}`, G6.membership, {
    id: s2Id(`membership:${key}`), tenant_id: ws, profile_id: s2Id(`user:${userKey}`), role, status, invited_by: null,
    invited_at: invited ? iso : null, invite_expires_at: invited ? isoDays(at, 7) : null, accepted_at: invited ? null : iso,
    created_at: iso, updated_at: iso,
  });
}

/** A fixture workspace: agency (cloned from the Group-6 workspace), owner membership, identity, staging subdomain. */
export function workspaceOps(fx, key, { slug, name, tagline, plan = "website", businessType, currency = "MXN", locales = ["es", "en"], tz = "America/Cancun", ownerKey, settings = {}, at }) {
  const ws = s2Id(`workspace:${key}`);
  const iso = at.toISOString();
  return {
    ws,
    ops: [
      clone(fx, "public.agencies", `workspace:${key}`, G6.ws, {
        id: ws, slug, display_name: name, plan_tier: plan, talent_seat_limit: null, workspace_type: "business",
        default_currency: currency, preferred_currency: currency.toLowerCase(), timezone: tz, supported_locales: locales,
        settings: { business_type_id: businessType, display_currency: currency, ...settings },
        onboarding_completed_at: iso, created_at: iso, updated_at: iso, default_coordinator_user_id: null,
      }),
      membershipOp(fx, `${key}-owner`, ws, ownerKey, { role: "owner" }, at),
      insert(fx, "public.agency_business_identity", `identity:${key}`, { tenant_id: ws, public_name: name, default_locale: locales[0], supported_locales: locales, tagline }, ["tenant_id"]),
      insert(fx, "public.agency_domains", `domain:${key}:sub`, {
        id: s2Id(`domain:${key}:sub`), tenant_id: ws, hostname: `${slug}.${STAGING_HOST_SUFFIX}`, kind: "subdomain", is_primary: true,
        status: "active", verified_at: iso, tenant_slug: slug,
      }),
    ],
  };
}

/**
 * A workspace-owned catalog row (menu import shape: owner_kind 'workspace', no talent).
 * spec: kind, title, titleEn, description, descriptionEn, category, cents (null = options-only), station (prep station id),
 * status, visibility, sort, attrs, bookingMode, poolId + stock (stock pool), extra (columns spread last).
 */
export function offeringOp(fx, key, ws, spec) {
  return insert(fx, "public.talent_offerings", `offering:${key}`, {
    id: s2Id(`offering:${key}`), tenant_id: ws, owner_kind: "workspace", talent_profile_id: null, kind: spec.kind ?? "product",
    title: spec.title, description: spec.description, title_i18n: J({ es: spec.title, en: spec.titleEn }),
    description_i18n: J({ es: spec.description, en: spec.descriptionEn }), category: spec.category,
    amount_cents: spec.cents ?? null, currency: spec.currency ?? "MXN", price_type: "flat_package", price_display: spec.cents == null ? "quote" : "exact",
    booking_mode: spec.bookingMode ?? "request", status: spec.status ?? "published", moderation_state: "approved", visibility: spec.visibility ?? "public",
    is_featured: false, sort_order: spec.sort ?? 0, attributes: J(spec.attrs ?? {}),
    ...(spec.station ? { prep_station_id: spec.station } : {}),
    ...(spec.poolId ? { capacity_pool_id: spec.poolId, inventory_qty: spec.stock } : {}),
    ...(spec.extra ?? {}),
  });
}

export const variantOp = (fx, key, offeringKey, v) =>
  insert(fx, "public.talent_offering_variants", `variant:${key}`, {
    id: s2Id(`variant:${key}`), offering_id: s2Id(`offering:${offeringKey}`), label: v.label, amount_cents: v.cents, sort_order: v.sort ?? 0,
    ...(v.hidden ? { is_hidden: true } : {}),
  });

export const addonOp = (fx, key, offeringKey, a) =>
  insert(fx, "public.talent_offering_addons", `addon:${key}`, {
    id: s2Id(`addon:${key}`), offering_id: s2Id(`offering:${offeringKey}`), label: a.label, amount_cents: a.cents, sort_order: a.sort ?? 0,
  });

/** A capacity pool (units, no time dimension unless the subject is a session). `pool_path` is rewritten by the trigger. */
export const poolOp = (fx, key, ws, { kind, subjectId, poolKey = "default", units, label = "unit" }) =>
  insert(fx, "public.capacity_pools", `pool:${key}`, {
    id: s2Id(`pool:${key}`), tenant_id: ws, subject_kind: kind, subject_id: subjectId, pool_key: poolKey, units_total: units, overbook_units: 0,
    hold_ttl_seconds: 900, unit_label: label, is_active: true, pool_path: [],
  });

/** A readable QR short link (kind table | menu). */
export const linkOp = (fx, key, ws, { code, name, kind, to, label, spaceId }) =>
  insert(fx, "public.links", `link:${key}`, {
    id: s2Id(`link:${key}`), tenant_id: ws, code, name, kind, targets: J([{ when: "always", to: { to, label } }]),
    context: J(spaceId ? { space_id: spaceId } : {}), status: "active",
  });

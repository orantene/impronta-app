import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { LIMIT_STATUSES } from "@/lib/orders/promo-redemption-status";
import type { Audience, AppliesOn, ClientStatus, OfferKind, Promo, ScopeKind, Unlock, UsageMap } from "@/lib/promos/types";

/**
 * The one read path from `tenant_promo_codes` into the engine's `Promo`.
 * Every surface (dashboard, site, checkout, share kit, results) loads promos
 * here, so a column is mapped once and the screens cannot disagree.
 */

/** Used when a promo has no tz of its own; the product's home market. */
export const DEFAULT_PROMO_TZ = "America/Mexico_City";

export const PROMO_COLUMNS =
  "id, tenant_id, talent_profile_id, code, name, label, kind, offer_kind, value, currency, addon_id, scope_kind, " +
  "min_subtotal_cents, audience, customer_id, is_single_use, unlock, link_slug, applies_on, " +
  "starts_at, ends_at, use_by_date, tz, weekdays, time_from, time_to, slot_id, max_redemptions, " +
  "per_customer_limit, deposit_required, show_on_site, show_countdown, title_i18n, description_i18n, " +
  "visual_style, template_key, is_active, is_draft, is_paused, archived_at, is_trial, parent_promo_id, created_at";

export type PromoRow = {
  id: string;
  tenant_id: string;
  /** Owning talent; null = agency-wide promo (agency tenants only). */
  talent_profile_id: string | null;
  code: string | null;
  name: string | null;
  label: string | null;
  kind: string;
  offer_kind: string | null;
  value: number;
  currency: string | null;
  addon_id: string | null;
  scope_kind: string | null;
  min_subtotal_cents: number | null;
  audience: string | null;
  customer_id: string | null;
  is_single_use: boolean | null;
  unlock: string | null;
  link_slug: string | null;
  applies_on: string | null;
  starts_at: string | null;
  ends_at: string | null;
  use_by_date: string | null;
  tz: string | null;
  weekdays: number[] | null;
  time_from: string | null;
  time_to: string | null;
  slot_id: string | null;
  max_redemptions: number | null;
  per_customer_limit: number;
  deposit_required: boolean | null;
  show_on_site: boolean | null;
  show_countdown: boolean | null;
  title_i18n: Record<string, string> | null;
  description_i18n: Record<string, string> | null;
  visual_style: string | null;
  template_key: string | null;
  is_active: boolean;
  is_draft: boolean | null;
  is_paused: boolean | null;
  archived_at: string | null;
  is_trial: boolean | null;
  parent_promo_id: string | null;
  created_at: string;
};

const OFFER_KINDS: readonly OfferKind[] = ["percent", "fixed", "fixed_price", "free_addon"];
const AUDIENCES: readonly Audience[] = ["public", "new_clients", "returning", "lapsed", "one_client"];
const UNLOCKS: readonly Unlock[] = ["auto", "code", "link"];

function pick<T extends string>(v: string | null, allowed: readonly T[], fallback: T): T {
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** "HH:MM:SS" from Postgres `time` -> "HH:MM". */
function hhmm(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

export function rowToPromo(
  r: PromoRow,
  extra: { targetIds?: readonly string[]; addonListCents?: number | null } = {},
): Promo {
  const scope: ScopeKind =
    r.scope_kind === "services" || r.scope_kind === "all_services" ? "services"
      : r.scope_kind === "products" ? "products" : "all";
  return {
    id: r.id,
    offer_kind: pick(r.offer_kind ?? r.kind, OFFER_KINDS, "fixed"),
    value: Number(r.value),
    currency: (r.currency ?? "MXN").toUpperCase(),
    addon: r.addon_id ? { id: r.addon_id, list_cents: extra.addonListCents ?? 0 } : null,
    scope,
    target_ids: extra.targetIds ?? null,
    min_subtotal_cents: r.min_subtotal_cents,
    audience: pick(r.audience, AUDIENCES, "public"),
    unlock: pick(r.unlock, UNLOCKS, "code"),
    code: r.code,
    applies_on: (r.applies_on === "appointment" ? "appointment" : "purchase") as AppliesOn,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    use_by_date: r.use_by_date,
    tz: r.tz || DEFAULT_PROMO_TZ,
    weekdays: r.weekdays,
    time_from: hhmm(r.time_from),
    time_to: hhmm(r.time_to),
    slot_id: r.slot_id,
    max_uses: r.max_redemptions,
    per_client_max: r.per_customer_limit,
    deposit_required: !!r.deposit_required,
    is_single_use: !!r.is_single_use,
    customer_id: r.customer_id,
    // Legacy `is_active = false` is a pause: the code exists but does not apply.
    is_draft: !!r.is_draft,
    is_paused: !!r.is_paused || !r.is_active,
    archived_at: r.archived_at,
    is_trial: !!r.is_trial,
  };
}

/**
 * Whose promos to load. A tenant alone is never enough: every hub talent
 * shares one tenant, so a tenant-wide read would hand one talent's promo to
 * all of them.
 *   - `{ talentProfileId }`: that talent's own promos.
 *   - `{ agencyWide: true }`: promos with no owner (agency admin discounts).
 */
export type PromoOwner = { talentProfileId: string } | { agencyWide: true };

/** All promos of one owner on a tenant (any status), with targets attached. */
export async function loadTenantPromos(
  admin: SupabaseClient,
  tenantId: string,
  owner: PromoOwner,
): Promise<{ ok: true; rows: PromoRow[]; promos: Promo[] } | { ok: false }> {
  const base = admin
    .from("tenant_promo_codes")
    .select(PROMO_COLUMNS)
    .eq("tenant_id", tenantId);
  const owned = "talentProfileId" in owner
    ? base.eq("talent_profile_id", owner.talentProfileId)
    : base.is("talent_profile_id", null);
  const { data, error } = await owned.order("created_at", { ascending: false });
  if (error) {
    logServerError("promos.repo/list", error);
    return { ok: false };
  }
  const rows = (data ?? []) as unknown as PromoRow[];
  const targets = await loadTargets(admin, rows.map((r) => r.id));
  if (!targets) return { ok: false };
  return {
    ok: true,
    rows,
    promos: rows.map((r) => rowToPromo(r, { targetIds: targets.get(r.id) })),
  };
}

async function loadTargets(
  admin: SupabaseClient,
  promoIds: readonly string[],
): Promise<Map<string, string[]> | null> {
  const out = new Map<string, string[]>();
  if (promoIds.length === 0) return out;
  const { data, error } = await admin
    .from("promo_targets")
    .select("promo_id, target_id")
    .in("promo_id", [...promoIds]);
  if (error) {
    logServerError("promos.repo/targets", error);
    return null;
  }
  for (const t of (data ?? []) as { promo_id: string; target_id: string }[]) {
    out.set(t.promo_id, [...(out.get(t.promo_id) ?? []), t.target_id]);
  }
  return out;
}

/**
 * Uses per promo, the way limits count them: confirmed + live holds. An
 * expired hold is not a use even before the sweep has released it.
 */
export async function loadUsage(
  admin: SupabaseClient,
  promoIds: readonly string[],
  customerId: string | null,
  now: Date = new Date(),
): Promise<UsageMap | null> {
  const usage: Record<string, { used: number; usedByClient: number }> = {};
  for (const id of promoIds) usage[id] = { used: 0, usedByClient: 0 };
  if (promoIds.length === 0) return usage;
  const { data, error } = await admin
    .from("tenant_promo_redemptions")
    .select("promo_code_id, customer_id, status, hold_expires_at")
    .in("promo_code_id", [...promoIds])
    .in("status", [...LIMIT_STATUSES]);
  if (error) {
    logServerError("promos.repo/usage", error);
    return null;
  }
  for (const r of (data ?? []) as {
    promo_code_id: string; customer_id: string | null; status: string; hold_expires_at: string | null;
  }[]) {
    if (r.status === "held" && r.hold_expires_at && new Date(r.hold_expires_at) <= now) continue;
    const u = usage[r.promo_code_id];
    if (!u) continue;
    u.used += 1;
    if (customerId && r.customer_id === customerId) u.usedByClient += 1;
  }
  return usage;
}

/**
 * Legacy event / tier scope of promos (`event_id`, `variant_id`). These codes
 * predate `promo_targets`; the order-side adapter honours them by narrowing
 * the lines before the engine sees them, so a tier code never discounts
 * another tier.
 */
export async function loadLegacyScopes(
  admin: SupabaseClient,
  promoIds: readonly string[],
): Promise<Map<string, { eventId: string | null; variantId: string | null }> | null> {
  const out = new Map<string, { eventId: string | null; variantId: string | null }>();
  if (promoIds.length === 0) return out;
  const { data, error } = await admin
    .from("tenant_promo_codes")
    .select("id, event_id, variant_id")
    .in("id", [...promoIds]);
  if (error) {
    logServerError("promos.repo/legacy-scopes", error);
    return null;
  }
  for (const r of (data ?? []) as { id: string; event_id: string | null; variant_id: string | null }[]) {
    out.set(r.id, { eventId: r.event_id ?? null, variantId: r.variant_id ?? null });
  }
  return out;
}

/** Default "lapsed" gap when a promo does not set `lapsed_days`. */
export const DEFAULT_LAPSED_DAYS = 90;

/** Order states that count as a real, paid visit for new / returning / lapsed. */
export const PAID_ORDER_STATUSES = ["paid", "fulfilled", "partially_refunded"] as const;

/**
 * Pure: new when there is no prior paid visit, lapsed when the last one is
 * older than `lapsedDays`, else returning.
 */
export function classifyClientStatus(
  lastPaidAt: string | null,
  now: Date,
  lapsedDays: number = DEFAULT_LAPSED_DAYS,
): ClientStatus {
  if (!lastPaidAt) return "new";
  const last = Date.parse(lastPaidAt);
  if (!Number.isFinite(last)) return "returning";
  const days = lapsedDays > 0 ? lapsedDays : DEFAULT_LAPSED_DAYS;
  return now.getTime() - last > days * 86_400_000 ? "lapsed" : "returning";
}

/**
 * The client's standing with this tenant, from their latest paid order
 * (bookings and purchases both settle through `orders`). A failed read is
 * null so the caller can refuse with "try again" instead of guessing.
 */
export async function loadClientStatus(
  admin: SupabaseClient,
  input: { tenantId: string; customerId: string | null; now?: Date; lapsedDays?: number | null; excludeOrderId?: string | null },
): Promise<ClientStatus | null> {
  if (!input.customerId) return "new";
  const { data, error } = await admin
    .from("orders")
    .select("id, created_at")
    .eq("tenant_id", input.tenantId)
    .eq("customer_id", input.customerId)
    .in("status", [...PAID_ORDER_STATUSES])
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) {
    logServerError("promos.repo/client-status", error);
    return null;
  }
  const last = ((data ?? []) as { id: string; created_at: string }[]).find((r) => r.id !== input.excludeOrderId);
  return classifyClientStatus(last?.created_at ?? null, input.now ?? new Date(), input.lapsedDays ?? DEFAULT_LAPSED_DAYS);
}

/** `lapsed_days` per promo (not part of the engine's `Promo` shape). */
export async function loadLapsedDays(
  admin: SupabaseClient,
  promoIds: readonly string[],
): Promise<Map<string, number | null> | null> {
  const out = new Map<string, number | null>();
  if (promoIds.length === 0) return out;
  const { data, error } = await admin
    .from("tenant_promo_codes")
    .select("id, lapsed_days")
    .in("id", [...promoIds]);
  if (error) {
    logServerError("promos.repo/lapsed-days", error);
    return null;
  }
  for (const r of (data ?? []) as { id: string; lapsed_days: number | null }[]) out.set(r.id, r.lapsed_days ?? null);
  return out;
}

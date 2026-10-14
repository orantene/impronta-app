import "server-only";

import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { emitNotificationToUsers, type EmitNotificationInput } from "@/lib/notifications/emit";
import {
  decideCancellation,
  decideRefund,
  holdMinutes,
  isBlockedFromLimitedPromos,
  isLimitedPromo,
  normalizeEmail,
  normalizePhone,
  personalCode,
  reissueEndsAt,
  resolveIdentity,
  shouldTripLeakGuard,
  type CancelEvent,
  type HoldFlow,
  type IdentityResolution,
  type RefundKind,
} from "./policy";

/**
 * Promos v1 redemption service (TUL-941). Thin IO over the SQL state machine
 * in 20261231382000 plus the pure rules in policy.ts.
 *
 * The client is INJECTED and must be service_role: every promo_* function is
 * revoked from anon/authenticated. Callers resolve auth (who is this client,
 * does this talent own this booking) before they get here.
 */

// TODO(TUL-941): switch to ClientStatus from ../types once PR1a's types land on main.
export type RedemptionClientStatus = "new" | "returning" | "lapsed";
export type SourceChannel = "ig_story" | "ig_post" | "tiktok" | "wa" | "qr" | "qr_print" | "link" | "email" | "code" | "site";
export type RedemptionSource = "auto" | "code" | "link" | "personal";

export type RpcResult = {
  ok: boolean;
  reason?: string;
  already?: boolean;
  redemption_id?: string;
  status?: string;
  hold_expires_at?: string | null;
  released?: number;
};

type Db = SupabaseClient;

async function rpc(db: Db, fn: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await db.rpc(fn, args);
  if (error) return { ok: false, reason: "db_error" };
  return (data ?? { ok: false, reason: "db_error" }) as RpcResult;
}

// ── Identity ──────────────────────────────────────────────────────────────

/** Phone OR email -> one customer of this tenant. Two exact queries, no `or()` string building. */
export async function resolveCustomer(
  db: Db,
  input: { tenantId: string; phone: string | null; email: string | null },
): Promise<IdentityResolution> {
  const phone = normalizePhone(input.phone);
  const email = normalizeEmail(input.email);
  const [byPhone, byEmail] = await Promise.all([
    phone
      ? db.from("customers").select("id").eq("tenant_id", input.tenantId).eq("phone_e164", phone).limit(1)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
    email
      ? db.from("customers").select("id").eq("tenant_id", input.tenantId).eq("email", email).limit(1)
      : Promise.resolve({ data: [] as { id: string }[], error: null }),
  ]);
  return resolveIdentity({
    byPhone: (byPhone.data ?? []) as { id: string }[],
    byEmail: (byEmail.data ?? []) as { id: string }[],
  });
}

// ── No-show eligibility ───────────────────────────────────────────────────

/** No-shows with THIS talent: the customers roll-up or promo no_show rows, whichever is higher. */
export async function countNoShowsWithTalent(db: Db, tenantId: string, customerId: string): Promise<number> {
  const [cust, rows] = await Promise.all([
    db.from("customers").select("no_shows").eq("id", customerId).eq("tenant_id", tenantId).maybeSingle(),
    db
      .from("tenant_promo_redemptions")
      .select("id, tenant_promo_codes!inner(tenant_id)", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("status", "no_show")
      .eq("tenant_promo_codes.tenant_id", tenantId),
  ]);
  const rollup = (cust.data as { no_shows: number } | null)?.no_shows ?? 0;
  return Math.max(rollup, rows.count ?? 0);
}

/** Silent: an ineligible client simply sees regular prices on limited promos. */
export async function isEligibleForPromo(
  db: Db,
  input: { tenantId: string; customerId: string; promo: { max_redemptions: number | null } },
): Promise<boolean> {
  if (!isLimitedPromo(input.promo)) return true;
  return !isBlockedFromLimitedPromos(await countNoShowsWithTalent(db, input.tenantId, input.customerId));
}

// ── State transitions ─────────────────────────────────────────────────────

export function holdPromo(
  db: Db,
  input: {
    promoId: string;
    customerId: string;
    flow: HoldFlow;
    orderId?: string | null;
    bookingId?: string | null;
    lineId?: string | null;
    discountCents: number;
    isPricePromo?: boolean;
    source?: RedemptionSource | null;
    clientStatus?: RedemptionClientStatus | null;
  },
): Promise<RpcResult> {
  return rpc(db, "promo_hold", {
    p_code_id: input.promoId,
    p_customer_id: input.customerId,
    p_order_id: input.orderId ?? null,
    p_booking_id: input.bookingId ?? null,
    p_line_id: input.lineId ?? null,
    p_hold_minutes: holdMinutes(input.flow),
    p_amount_cents: input.discountCents,
    p_is_price_promo: input.isPricePromo ?? true,
    p_source: input.source ?? null,
    p_client_status: input.clientStatus ?? null,
  });
}

export function confirmRedemption(
  db: Db,
  input: {
    redemptionId: string;
    listCents: number;
    discountCents: number;
    currency: string;
    sourceChannel: SourceChannel | null;
    clientStatus: RedemptionClientStatus | null;
  },
): Promise<RpcResult> {
  return rpc(db, "promo_confirm", {
    p_redemption_id: input.redemptionId,
    p_list_cents: input.listCents,
    p_discount_cents: input.discountCents,
    p_currency: input.currency,
    p_source_channel: input.sourceChannel,
    p_client_status: input.clientStatus,
  });
}

export function releaseRedemption(db: Db, redemptionId: string, fromConfirmed = false): Promise<RpcResult> {
  return rpc(db, "promo_release", { p_redemption_id: redemptionId, p_from_confirmed: fromConfirmed });
}

export function markNoShow(db: Db, redemptionId: string): Promise<RpcResult> {
  return rpc(db, "promo_no_show", { p_redemption_id: redemptionId });
}

export function voidRedemption(db: Db, redemptionId: string): Promise<RpcResult> {
  return rpc(db, "promo_void", { p_redemption_id: redemptionId });
}

export function sweepExpiredHolds(db: Db, limit = 500): Promise<RpcResult> {
  return rpc(db, "promo_sweep_expired_holds", { p_limit: limit });
}

/** Partial refund keeps the use; full refund voids it. */
export async function applyRefund(db: Db, redemptionId: string, kind: RefundKind): Promise<RpcResult> {
  if (decideRefund(kind) === "keep_use") return { ok: true, already: true };
  return voidRedemption(db, redemptionId);
}

/**
 * One entry point for every B3 cancel row. Returns the refund rule for the
 * payments layer, plus the re-issue code when the talent cancelled.
 */
export async function handleCancellation(
  db: Db,
  input: { redemptionId: string; event: CancelEvent; clientFirstName?: string | null; now?: Date },
): Promise<RpcResult & { refund: string; reissueCode?: string }> {
  const decision = decideCancellation(input.event);
  if (decision.action === "consume") return { ok: true, already: true, refund: decision.refund };
  if (decision.action === "no_show") return { ...(await markNoShow(db, input.redemptionId)), refund: decision.refund };

  const released = await releaseRedemption(db, input.redemptionId, true);
  if (!released.ok || decision.action === "release") return { ...released, refund: decision.refund };

  const reissue = await reissuePersonalPromo(db, {
    redemptionId: input.redemptionId,
    clientFirstName: input.clientFirstName ?? null,
    now: input.now ?? new Date(),
  });
  return { ...released, refund: decision.refund, reissueCode: reissue.code ?? undefined };
}

type ParentPromoRow = {
  id: string;
  tenant_id: string;
  kind: string;
  offer_kind: string;
  value: number;
  currency: string | null;
  scope_kind: string;
  event_id: string | null;
  variant_id: string | null;
  addon_id: string | null;
  applies_on: string;
  name: string | null;
  label: string | null;
};

/**
 * Talent cancelled: the client keeps the right to the promo for 14 days as a
 * single-use code bound to their customer id. Inserted with service_role.
 */
export async function reissuePersonalPromo(
  db: Db,
  input: { redemptionId: string; clientFirstName: string | null; now: Date },
): Promise<{ ok: boolean; code: string | null; promoId: string | null }> {
  const { data: red } = await db
    .from("tenant_promo_redemptions")
    .select("promo_code_id, customer_id")
    .eq("id", input.redemptionId)
    .maybeSingle();
  const r = red as { promo_code_id: string; customer_id: string | null } | null;
  if (!r?.customer_id) return { ok: false, code: null, promoId: null };

  const { data: parentData } = await db
    .from("tenant_promo_codes")
    .select("id, tenant_id, kind, offer_kind, value, currency, scope_kind, event_id, variant_id, addon_id, applies_on, name, label")
    .eq("id", r.promo_code_id)
    .maybeSingle();
  const parent = parentData as ParentPromoRow | null;
  if (!parent) return { ok: false, code: null, promoId: null };

  // Idempotent: a retried talent-cancel must not mint a second code.
  const { data: existing } = await db
    .from("tenant_promo_codes")
    .select("id, code")
    .eq("parent_promo_id", parent.id)
    .eq("customer_id", r.customer_id)
    .eq("courtesy_reason", "make_good")
    .gt("ends_at", input.now.toISOString())
    .limit(1);
  const prior = (existing ?? []) as { id: string; code: string }[];
  if (prior[0]) return { ok: true, code: prior[0].code, promoId: prior[0].id };

  // A code collision on (tenant, upper(code)) is 1 in ~900k; retry a few times.
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = personalCode(input.clientFirstName, (n) => randomInt(n));
    const { data, error } = await db
      .from("tenant_promo_codes")
      .insert({
        tenant_id: parent.tenant_id,
        code,
        label: parent.label,
        name: parent.name,
        kind: parent.kind,
        offer_kind: parent.offer_kind,
        value: parent.value,
        currency: parent.currency,
        scope_kind: parent.scope_kind,
        event_id: parent.event_id,
        variant_id: parent.variant_id,
        addon_id: parent.addon_id,
        applies_on: parent.applies_on,
        unlock: "code",
        audience: "one_client",
        customer_id: r.customer_id,
        is_single_use: true,
        max_redemptions: 1,
        per_customer_limit: 1,
        parent_promo_id: parent.id,
        courtesy_reason: "make_good",
        starts_at: input.now.toISOString(),
        ends_at: reissueEndsAt(input.now).toISOString(),
        // A make-good is not a leak risk and must not auto-pause.
        leak_guard: false,
      })
      .select("id")
      .single();
    if (!error && data) {
      const promoId = (data as { id: string }).id;
      // Same scope as the parent: copy its targets so "Tuesday nails" stays nails.
      const { data: targets } = await db
        .from("promo_targets")
        .select("target_kind, target_id")
        .eq("promo_id", parent.id);
      const rows = ((targets ?? []) as { target_kind: string; target_id: string }[]).map((t) => ({ ...t, promo_id: promoId }));
      if (rows.length > 0) await db.from("promo_targets").insert(rows);
      return { ok: true, code, promoId };
    }
    if (error && error.code !== "23505") break;
  }
  return { ok: false, code: null, promoId: null };
}

// ── Leak guard (L2) ───────────────────────────────────────────────────────

const HOUR_MS = 3_600_000;
const BASELINE_DAYS = 14;

export type LeakGuardDeps = {
  /** user ids that should hear about this tenant's promos (owner, staff). */
  talentUserIds: (tenantId: string) => Promise<string[]>;
  notify?: (userIds: string[], input: Omit<EmitNotificationInput, "userId">) => Promise<void>;
};

/**
 * Run after a NEW-client attempt on a code. Attempts = redemption rows created
 * for the code with client_status 'new' (set at hold time). Baseline = the
 * same over the previous 14 days, per day. Trips -> is_paused=true + notify.
 */
export async function runLeakGuard(
  db: Db,
  deps: LeakGuardDeps,
  input: { promoId: string; now?: Date },
): Promise<{ tripped: boolean }> {
  const now = input.now ?? new Date();
  const { data: promoData } = await db
    .from("tenant_promo_codes")
    .select("id, tenant_id, code, unlock, leak_guard, is_paused")
    .eq("id", input.promoId)
    .maybeSingle();
  const promo = promoData as
    | { id: string; tenant_id: string; code: string | null; unlock: string; leak_guard: boolean; is_paused: boolean }
    | null;
  if (!promo || !promo.leak_guard || promo.unlock !== "code" || promo.is_paused) return { tripped: false };

  const hourAgo = new Date(now.getTime() - HOUR_MS).toISOString();
  const baselineFrom = new Date(now.getTime() - BASELINE_DAYS * 24 * HOUR_MS).toISOString();
  const [lastHour, baseline] = await Promise.all([
    db
      .from("tenant_promo_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("promo_code_id", promo.id)
      .eq("client_status", "new")
      .gte("created_at", hourAgo),
    db
      .from("tenant_promo_redemptions")
      .select("id", { count: "exact", head: true })
      .eq("promo_code_id", promo.id)
      .eq("client_status", "new")
      .gte("created_at", baselineFrom)
      .lt("created_at", hourAgo),
  ]);
  const trip = shouldTripLeakGuard({
    newClientAttemptsLastHour: lastHour.count ?? 0,
    normalDailyNewClientRate: (baseline.count ?? 0) / BASELINE_DAYS,
  });
  if (!trip) return { tripped: false };

  // Conditional update: only the request that flips it notifies.
  const { data: flipped } = await db
    .from("tenant_promo_codes")
    .update({ is_paused: true })
    .eq("id", promo.id)
    .eq("is_paused", false)
    .select("id");
  if (!flipped || (flipped as { id: string }[]).length === 0) return { tripped: true };

  const userIds = await deps.talentUserIds(promo.tenant_id);
  if (userIds.length > 0) {
    const code = promo.code ?? "Tu código";
    await (deps.notify ?? emitNotificationToUsers)(userIds, {
      tenantId: promo.tenant_id,
      kind: "system",
      surface: "talent",
      title: `${code} se está usando mucho por gente nueva. ¿La dejas activa?`,
      body: "La pausamos por seguridad. Puedes mantenerla, dejarla en pausa o cambiar el código.",
      targetPayload: { promoId: promo.id, reason: "leak_guard" },
      // origin_event_id is a uuid column; the conditional update above is the dedupe.
      originEventId: null,
      originKind: "promo_leak_guard",
    });
  }
  return { tripped: true };
}

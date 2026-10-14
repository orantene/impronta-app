"use server";
/* eslint-disable ratchet/no-untenanted-from -- Every query here is scoped by the tenant resolved in resolvePromoScope (the signed-in talent's own profile, roster-checked) or by promo ids already read under that tenant. */

import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { USE_STATUSES } from "@/lib/orders/promo-redemption-status";
import { appointmentsTierForTalentPlan } from "@/lib/scheduling/talent-booking-mode";
import { requireTalentSelfAction } from "@/lib/saas/admin-scope";
import { ensureSoloTalentTenantId } from "@/lib/saas/solo-talent-tenant";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { loadCalloutState } from "@/lib/promos/callouts/dismissals.actions";
import { pickCallout, type Callout } from "@/lib/promos/callouts/engine";
import { loadPromoResults, type PromoResultsBundle } from "@/lib/promos/results/load.server";
import { canGoLive, type PlanGateReason } from "./plan-gating";
import { promoStatus } from "./quote";
import { DEFAULT_PROMO_TZ, PROMO_COLUMNS, loadTenantPromos, loadUsage, rowToPromo, type PromoRow } from "./repo";
import { applyEdit, endNowPatch, type EditVerdict } from "./safe-edit";
import { promoAttention } from "./talent-view";
import {
  draftToColumns, draftToPromo, duplicateDraft, promoSlug, repeatDraft, rowToDraft, validateDraft,
  type DraftError, type PromoDraft,
} from "./templates";
import type { Promo, PromoStatus } from "./types";

// ── result shapes ──────────────────────────────────────────────────────

export type PromoActionError = "not_allowed" | "not_found" | "invalid" | "code_taken" | "unavailable";

export type PromoFail =
  | { ok: false; error: PromoActionError; fields?: DraftError[] }
  /** The draft is kept; the UI opens the upgrade modal. */
  | { ok: false; needsUpgrade: true; reason: PlanGateReason | "paid_feature"; draftId: string | null };

export type PromoOk<T = Record<never, never>> = { ok: true } & T;
export type PromoResult<T = Record<never, never>> = PromoOk<T> | PromoFail;

export type ServiceOption = { id: string; title: string; list_cents: number; currency: string };
export type AddonOption = { id: string; label: string; list_cents: number; offering_id: string };

export type PromoListItem = {
  id: string;
  name: string;
  draft: PromoDraft;
  promo: Promo;
  status: PromoStatus;
  used: number;
  created_at: string;
  is_trial: boolean;
  parent_promo_id: string | null;
  link_slug: string | null;
};

export type PromosPageData = {
  profileCode: string;
  plan: "free" | "paid";
  trialUsed: boolean;
  currency: string;
  tz: string;
  nowIso: string;
  promos: PromoListItem[];
  services: ServiceOption[];
  addons: AddonOption[];
  /** Month roll-up always; per-promo results only the trial's own card on the free plan. */
  results: PromoResultsBundle;
  callout: Callout | null;
};

// ── scope ──────────────────────────────────────────────────────────────

type Scope = {
  admin: SupabaseClient;
  userId: string;
  talentId: string;
  profileCode: string;
  tenantId: string;
  plan: "free" | "paid";
  /** The talent's own zone (booking hours). Promo windows are local to it. */
  tz: string;
};

/**
 * The signed-in talent, their own tenant (active roster, solo talents healed
 * onto the hub like the services actions), and their plan. Auth is ownership of
 * the talent profile plus an active roster row on that tenant.
 */
async function resolvePromoScope(write: boolean): Promise<Scope | { error: PromoActionError }> {
  if (write) await requireNotImpersonating();
  const admin = createServiceRoleClient();
  if (!admin) return { error: "unavailable" };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { error: "unavailable" };
  // supabase-read-unchecked-ok: an auth error and "no user" both mean not signed in here
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;
  if (!user) return { error: "not_allowed" };
  const { data: tp, error: tpErr } = await supabase
    .from("talent_profiles")
    .select("id, profile_code, talent_plan_key")
    .eq("user_id", user.id)
    .maybeSingle();
  if (tpErr) {
    logServerError("promos.actions/profile", tpErr);
    return { error: "unavailable" };
  }
  const talentId = typeof tp?.id === "string" ? tp.id : null;
  if (!talentId) return { error: "not_allowed" };
  const self = await requireTalentSelfAction(talentId);
  if (!self.ok) return { error: "not_allowed" };

  let tenantId: string | null = null;
  if (self.tenantId) {
    const { data: roster, error: rosterErr } = await self.supabase
      .from("agency_talent_roster")
      .select("tenant_id")
      .eq("tenant_id", self.tenantId)
      .eq("talent_profile_id", talentId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    if (rosterErr) {
      logServerError("promos.actions/roster", rosterErr);
      return { error: "unavailable" };
    }
    tenantId = roster?.tenant_id ? String(roster.tenant_id) : null;
  }
  if (!tenantId) tenantId = await ensureSoloTalentTenantId(admin, talentId);
  if (!tenantId) return { error: "not_allowed" };

  const planKey = (tp as { talent_plan_key?: string | null }).talent_plan_key ?? null;
  const { data: hours, error: hoursErr } = await admin
    .from("talent_booking_hours")
    .select("timezone")
    .eq("talent_profile_id", talentId)
    .maybeSingle();
  if (hoursErr) logServerError("promos.actions/tz", hoursErr);
  const tzRaw = (hours as { timezone?: string | null } | null)?.timezone?.trim() ?? "";
  return {
    admin,
    userId: user.id,
    talentId,
    profileCode: String((tp as { profile_code?: string | null }).profile_code ?? ""),
    tenantId,
    plan: appointmentsTierForTalentPlan(planKey) === "website" ? "paid" : "free",
    tz: tzRaw && isValidTz(tzRaw) ? tzRaw : DEFAULT_PROMO_TZ,
  };
}

function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isScope(s: Scope | { error: PromoActionError }): s is Scope {
  return !("error" in s);
}

async function trialUsedElsewhere(scope: Scope, exceptId: string | null): Promise<boolean> {
  let q = scope.admin.from("tenant_promo_codes").select("id").eq("tenant_id", scope.tenantId).eq("is_trial", true).limit(1);
  if (exceptId) q = q.neq("id", exceptId);
  const { data, error } = await q;
  if (error) {
    logServerError("promos.actions/trial", error);
    return true; // unknown counts as used: never grant a second trial on a read failure
  }
  return (data ?? []).length > 0;
}

async function loadCatalog(scope: Scope): Promise<{ services: ServiceOption[]; addons: AddonOption[] } | null> {
  const { data, error } = await scope.admin
    .from("talent_offerings")
    .select("id, title, amount_cents, currency, status")
    .eq("tenant_id", scope.tenantId)
    .eq("talent_profile_id", scope.talentId)
    .neq("status", "archived")
    .order("sort_order", { ascending: true })
    .limit(200);
  if (error) {
    logServerError("promos.actions/catalog", error);
    return null;
  }
  const rows = (data ?? []) as unknown as { id: string; title: string; amount_cents: number | null; currency: string | null }[];
  const services: ServiceOption[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    list_cents: Number(r.amount_cents ?? 0),
    currency: (r.currency ?? "MXN").toUpperCase(),
  }));
  let addons: AddonOption[] = [];
  if (services.length > 0) {
    const { data: a, error: aErr } = await scope.admin
      .from("talent_offering_addons")
      .select("id, offering_id, label, amount_cents")
      .in("offering_id", services.map((s) => s.id));
    if (aErr) {
      logServerError("promos.actions/addons", aErr);
      return null;
    }
    addons = ((a ?? []) as unknown as { id: string; offering_id: string; label: string; amount_cents: number | null }[]).map((x) => ({
      id: x.id,
      offering_id: x.offering_id,
      label: x.label,
      list_cents: Number(x.amount_cents ?? 0),
    }));
  }
  return { services, addons };
}

async function loadOwnedRow(scope: Scope, id: string): Promise<{ row: PromoRow; targets: string[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await scope.admin
    .from("tenant_promo_codes")
    .select(PROMO_COLUMNS)
    .eq("id", id)
    .eq("tenant_id", scope.tenantId)
    .maybeSingle();
  if (error || !data) {
    if (error) logServerError("promos.actions/row", error);
    return null;
  }
  const { data: t, error: tErr } = await scope.admin.from("promo_targets").select("target_id").eq("promo_id", id);
  if (tErr) {
    logServerError("promos.actions/targets", tErr);
    return null;
  }
  return { row: data as unknown as PromoRow, targets: ((t ?? []) as { target_id: string }[]).map((x) => x.target_id) };
}

async function usedCount(scope: Scope, id: string): Promise<number> {
  const u = await loadUsage(scope.admin, [id], null);
  return u?.[id]?.used ?? 0;
}

/** Strip anything the client should not decide: tz, ids, and values outside the catalog. */
function sanitizeDraft(d: PromoDraft, catalog: { services: ServiceOption[]; addons: AddonOption[] }, tz: string): PromoDraft {
  const serviceIds = new Set(catalog.services.map((s) => s.id));
  const addon = d.addon_id ? catalog.addons.find((a) => a.id === d.addon_id) ?? null : null;
  return {
    ...d,
    name: d.name.trim().slice(0, 80),
    currency: (d.currency || "MXN").toUpperCase().slice(0, 3),
    tz,
    target_ids: d.target_ids.filter((id) => serviceIds.has(id)),
    addon_id: addon?.id ?? null,
    addon_list_cents: addon?.list_cents ?? 0,
    scope: "services",
    weekdays: d.weekdays.filter((w) => Number.isInteger(w) && w >= 0 && w <= 6),
    value: Math.round(Number(d.value) || 0),
    per_client_max: Math.max(1, Math.round(Number(d.per_client_max) || 1)),
  };
}

async function writeTargets(scope: Scope, promoId: string, ids: readonly string[]): Promise<boolean> {
  const del = await scope.admin.from("promo_targets").delete().eq("promo_id", promoId);
  if (del.error) {
    logServerError("promos.actions/targets-delete", del.error);
    return false;
  }
  if (ids.length === 0) return true;
  const ins = await scope.admin
    .from("promo_targets")
    .insert(ids.map((id) => ({ promo_id: promoId, target_kind: "service", target_id: id })));
  if (ins.error) {
    logServerError("promos.actions/targets-insert", ins.error);
    return false;
  }
  return true;
}

function failFrom(error: { code?: string } | null): PromoFail {
  return { ok: false, error: error?.code === "23505" ? "code_taken" : "unavailable" };
}

const refresh = () => revalidatePath("/talent/promos");

// ── reads ──────────────────────────────────────────────────────────────

export async function loadPromosPage(): Promise<PromoResult<{ data: PromosPageData }>> {
  const scope = await resolvePromoScope(false);
  if (!isScope(scope)) return { ok: false, error: scope.error };
  const [list, catalog, trialUsed] = await Promise.all([
    loadTenantPromos(scope.admin, scope.tenantId),
    loadCatalog(scope),
    trialUsedElsewhere(scope, null),
  ]);
  if (!list.ok || !catalog) return { ok: false, error: "unavailable" };
  const now = new Date();
  const usage = await loadUsage(scope.admin, list.rows.map((r) => r.id), null, now);
  if (!usage) return { ok: false, error: "unavailable" };

  const addonCents = new Map(catalog.addons.map((a) => [a.id, a.list_cents]));
  const promos: PromoListItem[] = list.rows.map((row, i) => {
    const promo = list.promos[i]!;
    const addonList = row.addon_id ? addonCents.get(row.addon_id) ?? 0 : 0;
    const withAddon: Promo = promo.addon ? { ...promo, addon: { id: promo.addon.id, list_cents: addonList } } : promo;
    return {
      id: row.id,
      name: row.name ?? row.label ?? row.code ?? "",
      draft: rowToDraft(row, promo.target_ids ?? [], addonList),
      promo: withAddon,
      status: promoStatus(withAddon, now, usage[row.id]),
      used: usage[row.id]?.used ?? 0,
      created_at: row.created_at,
      is_trial: !!row.is_trial,
      parent_promo_id: row.parent_promo_id,
      link_slug: row.link_slug,
    };
  });

  const bundle = await loadPromoResults(
    scope.admin,
    list.rows.map((r) => ({ id: r.id, max_uses: r.max_redemptions, starts_at: r.starts_at, created_at: r.created_at })),
    now,
  );
  const empty: PromoResultsBundle = bundle ?? {
    results: {},
    month: { bookings: 0, earnedCents: 0, givenCents: 0, giftedCents: 0, newClients: 0, returningClients: 0 },
  };
  // Results history is paid; a free talent keeps only the trial promo's own card.
  const trialIds = new Set(promos.filter((p) => p.is_trial).map((p) => p.id));
  const results: PromoResultsBundle =
    scope.plan === "paid"
      ? empty
      : { month: empty.month, results: Object.fromEntries(Object.entries(empty.results).filter(([id]) => trialIds.has(id))) };

  const calloutState = await loadCalloutState();
  // TODO(promos-callouts): feed upcomingDays / lapsedClients / services / cancellation
  // once the agenda and clients loaders expose them. Until then only state is passed,
  // so no callout fires from this page; the mount and the response actions are live.
  const callout = pickCallout({ now, state: calloutState });

  return {
    ok: true,
    data: {
      profileCode: scope.profileCode,
      plan: scope.plan,
      trialUsed,
      currency: catalog.services[0]?.currency ?? "MXN",
      tz: scope.tz,
      nowIso: now.toISOString(),
      promos,
      services: catalog.services,
      addons: catalog.addons,
      results,
      callout,
    },
  };
}

/** Light read for the header dot: sold out, ending soon, or a callout waiting. */
export async function getPromoAttention(): Promise<{ attention: boolean }> {
  const scope = await resolvePromoScope(false);
  if (!isScope(scope)) return { attention: false };
  const list = await loadTenantPromos(scope.admin, scope.tenantId);
  if (!list.ok) return { attention: false };
  const now = new Date();
  const usage = await loadUsage(scope.admin, list.rows.map((r) => r.id), null, now);
  if (!usage) return { attention: false };
  const items = list.promos.map((p) => ({ id: p.id, status: promoStatus(p, now, usage[p.id]), promo: p }));
  const callout = pickCallout({ now, state: await loadCalloutState() });
  return { attention: promoAttention(items, now, callout !== null).length > 0 };
}

export type PromoBooking = { created_at: string; discount_cents: number; list_cents: number; client_status: string | null };

export async function loadPromoBookings(id: string): Promise<PromoResult<{ bookings: PromoBooking[] }>> {
  const scope = await resolvePromoScope(false);
  if (!isScope(scope)) return { ok: false, error: scope.error };
  const owned = await loadOwnedRow(scope, id);
  if (!owned) return { ok: false, error: "not_found" };
  const { data, error } = await scope.admin
    .from("tenant_promo_redemptions")
    .select("created_at, discount_cents, list_cents, client_status")
    .eq("promo_code_id", id)
    .in("status", [...USE_STATUSES])
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    logServerError("promos.actions/bookings", error);
    return { ok: false, error: "unavailable" };
  }
  const bookings = ((data ?? []) as unknown as { created_at: string; discount_cents: number | null; list_cents: number | null; client_status: string | null }[]).map((r) => ({
    created_at: r.created_at,
    discount_cents: Number(r.discount_cents ?? 0),
    list_cents: Number(r.list_cents ?? 0),
    client_status: r.client_status,
  }));
  return { ok: true, bookings };
}

// ── writes ─────────────────────────────────────────────────────────────

async function insertPromo(
  scope: Scope,
  draft: PromoDraft,
  flags: { is_draft: boolean; is_trial: boolean; parent_promo_id?: string | null },
): Promise<PromoResult<{ id: string }>> {
  const { data, error } = await scope.admin
    .from("tenant_promo_codes")
    .insert({
      ...draftToColumns(draft),
      link_slug: promoSlug(draft.name, crypto.randomUUID().slice(0, 6)),
      tenant_id: scope.tenantId,
      created_by: scope.userId,
      is_active: true,
      is_draft: flags.is_draft,
      is_paused: false,
      is_trial: flags.is_trial,
      parent_promo_id: flags.parent_promo_id ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (error) logServerError("promos.actions/insert", error);
    return failFrom(error);
  }
  const id = String((data as { id: string }).id);
  if (!(await writeTargets(scope, id, draft.target_ids))) return { ok: false, error: "unavailable" };
  return { ok: true, id };
}

/**
 * Create a promo. mode "draft" always works. mode "live" is gated: a free
 * talent gets the lifetime trial (public + auto, <= 7 days, <= 5 uses) or the
 * draft is saved and {needsUpgrade:true} comes back so the UI opens the upgrade
 * modal and keeps the work.
 */
export async function createPromo(input: { draft: PromoDraft; mode: "draft" | "live" }): Promise<PromoResult<{ id: string; status: PromoStatus }>> {
  await requireNotImpersonating();
  const scope = await resolvePromoScope(true);
  if (!isScope(scope)) return { ok: false, error: scope.error };
  const catalog = await loadCatalog(scope);
  if (!catalog) return { ok: false, error: "unavailable" };
  const draft = sanitizeDraft(input.draft, catalog, scope.tz);
  const fields = validateDraft(draft);
  if (fields.length > 0) return { ok: false, error: "invalid", fields };

  if (input.mode === "draft") {
    const made = await insertPromo(scope, draft, { is_draft: true, is_trial: false });
    if (!made.ok) return made;
    refresh();
    return { ok: true, id: made.id, status: "draft" };
  }
  const gate = canGoLive({ plan: scope.plan, trialUsed: await trialUsedElsewhere(scope, null), promo: draftToPromo(draft) });
  if (!gate.allowed) {
    const kept = await insertPromo(scope, draft, { is_draft: true, is_trial: false });
    refresh();
    return { ok: false, needsUpgrade: true, reason: gate.reason, draftId: kept.ok ? kept.id : null };
  }
  const made = await insertPromo(scope, draft, { is_draft: false, is_trial: gate.reason === "trial" });
  if (!made.ok) return made;
  refresh();
  return { ok: true, id: made.id, status: promoStatus(draftToPromo(draft, made.id), new Date(), { used: 0 }) };
}

/** Draft -> live (or scheduled when it starts later). Same gate as createPromo. */
export async function goLivePromo(id: string): Promise<PromoResult<{ status: PromoStatus }>> {
  await requireNotImpersonating();
  const scope = await resolvePromoScope(true);
  if (!isScope(scope)) return { ok: false, error: scope.error };
  const owned = await loadOwnedRow(scope, id);
  if (!owned) return { ok: false, error: "not_found" };
  const draft = rowToDraft(owned.row, owned.targets);
  const gate = canGoLive({ plan: scope.plan, trialUsed: await trialUsedElsewhere(scope, id), promo: draftToPromo(draft, id) });
  if (!gate.allowed) return { ok: false, needsUpgrade: true, reason: gate.reason, draftId: id };
  const { error } = await scope.admin
    .from("tenant_promo_codes")
    .update({ is_draft: false, is_paused: false, is_trial: gate.reason === "trial" })
    .eq("id", id)
    .eq("tenant_id", scope.tenantId);
  if (error) {
    logServerError("promos.actions/go-live", error);
    return { ok: false, error: "unavailable" };
  }
  refresh();
  return { ok: true, status: promoStatus(draftToPromo(draft, id), new Date(), { used: 0 }) };
}

/** Edit with the B4 rules: locked fields revert, restricting changes report that bookings keep their terms. */
export async function updatePromo(id: string, input: PromoDraft): Promise<PromoResult<{ verdict: EditVerdict }>> {
  await requireNotImpersonating();
  const scope = await resolvePromoScope(true);
  if (!isScope(scope)) return { ok: false, error: scope.error };
  const [owned, catalog] = await Promise.all([loadOwnedRow(scope, id), loadCatalog(scope)]);
  if (!owned) return { ok: false, error: "not_found" };
  if (!catalog) return { ok: false, error: "unavailable" };
  const used = await usedCount(scope, id);
  const current = rowToDraft(owned.row, owned.targets);
  const { draft, verdict } = applyEdit(current, sanitizeDraft(input, catalog, scope.tz), used);
  const fields = validateDraft(draft);
  if (fields.length > 0) return { ok: false, error: "invalid", fields };
  if (scope.plan === "free" && !owned.row.is_draft) {
    const gate = canGoLive({ plan: "free", trialUsed: !owned.row.is_trial, promo: draftToPromo(draft, id) });
    if (!gate.allowed) return { ok: false, needsUpgrade: true, reason: gate.reason, draftId: id };
  }
  const { error } = await scope.admin
    .from("tenant_promo_codes")
    .update({ ...draftToColumns(draft), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("tenant_id", scope.tenantId);
  if (error) {
    logServerError("promos.actions/update", error);
    return failFrom(error);
  }
  if (!(await writeTargets(scope, id, draft.target_ids))) return { ok: false, error: "unavailable" };
  refresh();
  return { ok: true, verdict };
}

export async function pausePromo(id: string): Promise<PromoResult> {
  await requireNotImpersonating();
  return setPaused(id, true);
}

/** Resume is going live again, so the free plan only allows it for the trial promo. */
export async function resumePromo(id: string): Promise<PromoResult> {
  await requireNotImpersonating();
  return setPaused(id, false);
}

async function setPaused(id: string, paused: boolean): Promise<PromoResult> {
  const scope = await resolvePromoScope(true);
  if (!isScope(scope)) return { ok: false, error: scope.error };
  const owned = await loadOwnedRow(scope, id);
  if (!owned) return { ok: false, error: "not_found" };
  if (!paused && scope.plan === "free" && !owned.row.is_trial) {
    return { ok: false, needsUpgrade: true, reason: "trial_used", draftId: id };
  }
  const { error } = await scope.admin
    .from("tenant_promo_codes")
    .update({ is_paused: paused })
    .eq("id", id)
    .eq("tenant_id", scope.tenantId);
  if (error) {
    logServerError("promos.actions/pause", error);
    return { ok: false, error: "unavailable" };
  }
  refresh();
  return { ok: true };
}

/** Duplicate is a paid feature: copy as a draft, dates cleared, code suffixed. */
export async function duplicatePromo(id: string): Promise<PromoResult<{ id: string }>> {
  await requireNotImpersonating();
  const scope = await resolvePromoScope(true);
  if (!isScope(scope)) return { ok: false, error: scope.error };
  if (scope.plan !== "paid") return { ok: false, needsUpgrade: true, reason: "paid_feature", draftId: null };
  const owned = await loadOwnedRow(scope, id);
  if (!owned) return { ok: false, error: "not_found" };
  const made = await insertPromo(scope, duplicateDraft(rowToDraft(owned.row, owned.targets)), {
    is_draft: true, is_trial: false, parent_promo_id: id,
  });
  if (made.ok) refresh();
  return made;
}

/** Repeat an ended promo (paid): a duplicate with dates shifted by `months`, saved as a draft. */
export async function repeatPromo(id: string, months: 1 | 12): Promise<PromoResult<{ id: string }>> {
  await requireNotImpersonating();
  const scope = await resolvePromoScope(true);
  if (!isScope(scope)) return { ok: false, error: scope.error };
  if (scope.plan !== "paid") return { ok: false, needsUpgrade: true, reason: "paid_feature", draftId: null };
  const owned = await loadOwnedRow(scope, id);
  if (!owned) return { ok: false, error: "not_found" };
  const made = await insertPromo(scope, repeatDraft(rowToDraft(owned.row, owned.targets), { months }), {
    is_draft: true, is_trial: false, parent_promo_id: id,
  });
  if (made.ok) refresh();
  return made;
}

/** End now. Bookings that used the promo keep their price (redemption rows snapshot it). */
export async function endPromo(id: string): Promise<PromoResult> {
  await requireNotImpersonating();
  const scope = await resolvePromoScope(true);
  if (!isScope(scope)) return { ok: false, error: scope.error };
  const owned = await loadOwnedRow(scope, id);
  if (!owned) return { ok: false, error: "not_found" };
  const patch = endNowPatch(rowToPromo(owned.row, { targetIds: owned.targets }), new Date());
  const { error } = await scope.admin
    .from("tenant_promo_codes")
    .update(patch.kind === "archive" ? { archived_at: patch.archived_at } : { ends_at: patch.ends_at })
    .eq("id", id)
    .eq("tenant_id", scope.tenantId);
  if (error) {
    logServerError("promos.actions/end", error);
    return { ok: false, error: "unavailable" };
  }
  refresh();
  return { ok: true };
}

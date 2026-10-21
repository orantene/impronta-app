import "server-only";

/**
 * TUL-1270 #11 + #12: the server half of the Services editor checks, called by
 * upsertTalentOffering right after validateOffering.
 *  - #11: a save that moves an item onto the public menu (new + published, or a
 *    stored draft/hidden/archived row published) must pass publishReadiness.
 *    Saves of an already-live item are not re-gated (list quick edits and the
 *    editor's Save changes keep working). The rule is publishBlockers, the
 *    same function the editor's Publish button uses.
 *  - #12: a save that NEWLY picks instant booking on a plan without instant is
 *    refused (instantPlanRefuses); stored instant rows keep saving.
 * One read of the stored row (status, booking_mode) when the item exists.
 *
 * TUL-1634: the workspace Menu save (upsertWorkspaceMenuItem) runs the SAME
 * gate through `workspaceOfferingSaveGate`. Only the stored-row read differs
 * (tenant_id + owner_kind='workspace' instead of talent_profile_id). The plan
 * and the default booking posture come from the workspace OWNER's talent
 * profile (the same owner rule the workspace scope uses); a workspace with no
 * owner talent has an unknown plan, which never refuses (the loader's rule),
 * and the platform default posture. The MXN/USD rule is `offeringCurrencyRefusal`,
 * shared by both saves.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { isTalentCurrency } from "@/lib/billing/currencies";
import { logServerError } from "@/lib/server/safe-error";
import { loadTalentDefaultPosture } from "@/lib/talent/offerings-auth.server";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { loadPlanAllowsInstant } from "@/lib/talent/plan-instant.server";
import { INSTANT_PLAN_REFUSAL_EN, instantPlanRefuses } from "@/lib/talent/instant-plan-gate";
import { isPublishTransition, notReadyToPublishMessage, publishBlockers } from "@/lib/talent/publish-readiness";
import { PLATFORM_DEFAULT_BOOKING_POSTURE } from "@/lib/talent/selling-booking-settings";

type Prior = { status: string | null; booking_mode: string | null } | null;

/** Whose row this save writes: a talent's own offering, or a workspace (house) item. */
export type OfferingSaveScope =
  | { kind: "talent"; talentProfileId: string }
  | { kind: "workspace"; tenantId: string; ownerTalentId: string | null; ownerTalentIds?: readonly string[] };

/** The two reads the gate needs besides the stored row. Injected in tests. */
export type OfferingSaveGateDeps = {
  loadPosture: (talentProfileId: string) => Promise<string>;
  loadPlanAllowsInstant: (admin: SupabaseClient, talentProfileIds: readonly string[]) => Promise<Map<string, boolean>>;
};

const DEFAULT_DEPS: OfferingSaveGateDeps = {
  loadPosture: loadTalentDefaultPosture,
  loadPlanAllowsInstant,
};

/** The refusal both saves give for a price outside MXN/USD (owner ruling 2026-09-23). Never defaulted. */
export const OFFERING_CURRENCY_REFUSAL_EN = "Set the price in Mexican pesos (MXN) or US dollars (USD).";
/** TUL-1634 follow-up: the Spanish text, picked by locale. */
export const OFFERING_CURRENCY_REFUSAL_ES = "Pon el precio en pesos mexicanos (MXN) o dólares (USD).";

/** Null when the currency is MXN or USD; the refusal otherwise, in English unless `locale` starts with "es". */
export function offeringCurrencyRefusal(currency: unknown, locale?: string): string | null {
  if (isTalentCurrency(currency)) return null;
  return typeof locale === "string" && locale.startsWith("es") ? OFFERING_CURRENCY_REFUSAL_ES : OFFERING_CURRENCY_REFUSAL_EN;
}

/** The talent profile whose default posture governs this save (null = none). */
function planTalentId(scope: OfferingSaveScope): string | null {
  return scope.kind === "talent" ? scope.talentProfileId : scope.ownerTalentId;
}

/**
 * TUL-1712: the talent profiles whose PLANS decide the instant-booking rule. A talent save: that
 * talent. A workspace save: EVERY active owner (sorted, so the order they were read in never
 * matters), falling back to the single `ownerTalentId` for callers that only know one.
 */
export function planTalentIds(scope: OfferingSaveScope): string[] {
  if (scope.kind === "talent") return [scope.talentProfileId];
  const ids = scope.ownerTalentIds && scope.ownerTalentIds.length > 0 ? scope.ownerTalentIds : scope.ownerTalentId ? [scope.ownerTalentId] : [];
  return [...new Set(ids)].sort();
}

/**
 * One answer for the workspace from its owners' plans: instant is allowed when ANY known owner plan
 * allows it (the workspace is as capable as its best plan), refused only when every known plan is
 * a no, and unknown (undefined, never refuses) when no plan could be read. Independent of order.
 */
export function workspaceAllowsInstant(plans: ReadonlyMap<string, boolean>, ids: readonly string[]): boolean | undefined {
  let known = false;
  for (const id of ids) {
    const v = plans.get(id);
    if (v === true) return true;
    if (v === false) known = true;
  }
  return known ? false : undefined;
}

async function loadPrior(admin: unknown, scope: OfferingSaveScope, offeringId: string): Promise<{ ok: true; prior: Prior } | { ok: false }> {
  const base = (admin as SupabaseClient).from("talent_offerings").select("status, booking_mode").eq("id", offeringId);
  const scoped =
    scope.kind === "talent"
      ? base.eq("talent_profile_id", scope.talentProfileId)
      : base.eq("tenant_id", scope.tenantId).eq("owner_kind", "workspace");
  const { data, error } = await scoped.maybeSingle();
  if (error) {
    logServerError("talent.offerings.saveGate.prior", error);
    return { ok: false };
  }
  return { ok: true, prior: (data as Prior) ?? null };
}

/** The gate for either scope. `offeringSaveGate` / `workspaceOfferingSaveGate` are the two entry points. */
export async function offeringSaveGateFor(
  admin: unknown,
  scope: OfferingSaveScope,
  offering: TalentOffering,
  deps: OfferingSaveGateDeps = DEFAULT_DEPS,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const wantsPublish = offering.status === "published";
  const wantsInstant = offering.bookingMode === "instant";
  if (!wantsPublish && !wantsInstant) return { ok: true };

  let prior: Prior = null;
  if (offering.id) {
    const read = await loadPrior(admin, scope, offering.id);
    if (!read.ok) return { ok: false, error: "Failed to save." };
    prior = read.prior;
  }

  const planId = planTalentId(scope);
  if (isPublishTransition(offering.status, prior?.status)) {
    const posture = planId ? await deps.loadPosture(planId) : PLATFORM_DEFAULT_BOOKING_POSTURE;
    const missing = publishBlockers(offering, prior?.status, posture);
    if (missing.length > 0) return { ok: false, error: notReadyToPublishMessage(offering.title, missing) };
  }

  if (wantsInstant && prior?.booking_mode !== "instant") {
    // No plan owner = unknown plan, which never refuses (same rule as loadPlanAllowsInstant on a failed read).
    const planIds = planTalentIds(scope);
    const plans = planIds.length > 0 ? await deps.loadPlanAllowsInstant(admin as SupabaseClient, planIds) : new Map<string, boolean>();
    const refuse = instantPlanRefuses({
      nextMode: offering.bookingMode,
      priorMode: prior?.booking_mode ?? null,
      planAllowsInstant: workspaceAllowsInstant(plans, planIds),
    });
    if (refuse) return { ok: false, error: INSTANT_PLAN_REFUSAL_EN };
  }
  return { ok: true };
}

export async function offeringSaveGate(
  admin: unknown,
  talentProfileId: string,
  offering: TalentOffering,
  deps?: OfferingSaveGateDeps,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return offeringSaveGateFor(admin, { kind: "talent", talentProfileId }, offering, deps);
}

/**
 * TUL-1634: the workspace Menu save's checks, in the talent save's order:
 * the publish/plan gate, then the MXN/USD currency rule.
 */
export async function workspaceOfferingSaveGate(
  admin: unknown,
  tenantId: string,
  ownerTalentId: string | null,
  offering: TalentOffering,
  deps?: OfferingSaveGateDeps,
  locale?: string,
  /** TUL-1712: every active owner's talent id; the plan rule reads all of them. */
  ownerTalentIds?: readonly string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await offeringSaveGateFor(admin, { kind: "workspace", tenantId, ownerTalentId, ownerTalentIds }, offering, deps);
  if (!gate.ok) return gate;
  const currency = offeringCurrencyRefusal(offering.currency, locale);
  return currency ? { ok: false, error: currency } : { ok: true };
}

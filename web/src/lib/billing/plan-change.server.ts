/**
 * TUL-831 · server glue for in-app plan change: finds the subject's own
 * subscription id (service role, keyed by the session-resolved subject, never a
 * browser id) and the catalog price, then hands off to plan-change.ts.
 */
import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/client";
import { resolveTalentPriceId, resolveWorkspacePriceId } from "@/lib/stripe/price-catalog";
import type { TalentPlanKey, WorkspacePlanKey } from "@/lib/stripe/price-ids";
import { parseBillingInterval } from "@/lib/pricing/interval-pricing";
import { toCatalogInterval } from "./checkout-interval";
import { logServerError } from "@/lib/server/safe-error";
import { confirmPlanChange, previewPlanChange, type PlanChangeRequest } from "./plan-change";
import { resolvePlanChangePromoWith } from "./plan-change-promo";
import { countSubjectRedemptions } from "./checkout-discounts";
import { loadActiveTierId } from "./promo-catalog-reads";
import { PROMO_ERROR_MESSAGES, type PromoErrorCode } from "./promo-preview";
import { validateDiscount } from "@/lib/server-actions/admin-product-discounts";
import { TALENT_TIER_SLUG, WORKSPACE_TIER_SLUG } from "@/lib/stripe/price-catalog";
import type { PlanChangeConfirm, PlanChangePreview } from "./plan-change-policy";
import { isExistingSubscriptionStatus } from "./subscription-live-status";
import { clearPendingDowngrade, recordPendingDowngrade, type PendingDowngrade } from "./workspace-downgrade-archive";
import { cancelWorkspaceSubscriptionAtPeriodEnd } from "@/lib/stripe/workspace-billing";
import {
  applyWorkspaceDowngradeAtStripe,
  type WorkspaceDowngradeStripeResult,
  type WorkspaceDowngradeTarget,
} from "./workspace-downgrade-stripe";

const TALENT_PLANS = new Set<string>(["talent_pro", "talent_portfolio"]);
const WORKSPACE_PLANS = new Set<string>(["website", "studio", "agency", "network"]);

async function buildRequest(
  kind: "talent" | "workspace",
  subjectId: string,
  toPlan: string,
  rawInterval: unknown,
): Promise<PlanChangeRequest | { error: string; code: "no_subscription" | "not_allowed" }> {
  if (!(kind === "talent" ? TALENT_PLANS : WORKSPACE_PLANS).has(toPlan)) {
    return { error: "Unknown plan.", code: "not_allowed" };
  }
  const sb = createServiceRoleClient();
  if (!sb) return { error: "Billing is not available yet.", code: "no_subscription" };
  const read =
    kind === "talent"
      ? await sb.from("talent_subscriptions").select("stripe_subscription_id").eq("talent_profile_id", subjectId).maybeSingle()
      : await sb.from("workspace_subscriptions").select("stripe_subscription_id").eq("tenant_id", subjectId).maybeSingle();
  if (read.error) logServerError("billing.planChange.read", read.error);
  const subscriptionId = (read.data as { stripe_subscription_id?: string | null } | null)?.stripe_subscription_id ?? null;
  if (!subscriptionId) return { error: "You do not have a paid plan to change yet.", code: "no_subscription" };
  const toInterval = parseBillingInterval(rawInterval);
  const catalog = toCatalogInterval(toInterval);
  const toPriceId =
    kind === "talent"
      ? await resolveTalentPriceId(toPlan as TalentPlanKey, catalog)
      : await resolveWorkspacePriceId(toPlan as WorkspacePlanKey, catalog);
  return { kind, subjectId, subscriptionId, toPlan, toInterval, toPriceId: toPriceId?.trim() || null };
}

/**
 * TUL-833: attach a validated promo code to the request. The code is re-validated here against the catalog (the
 * browser value is only a string); an empty code is no code.
 */
async function withPromo(
  req: PlanChangeRequest,
  rawCode: unknown,
): Promise<PlanChangeRequest | { error: string; promoError: PromoErrorCode }> {
  const code = typeof rawCode === "string" ? rawCode.trim() : "";
  if (!code) return req;
  const admin = createServiceRoleClient();
  if (!admin) return { error: PROMO_ERROR_MESSAGES.invalid.en, promoError: "invalid" };
  const slug =
    req.kind === "talent"
      ? TALENT_TIER_SLUG[req.toPlan as TalentPlanKey]
      : WORKSPACE_TIER_SLUG[req.toPlan as WorkspacePlanKey];
  const out = await resolvePlanChangePromoWith(
    {
      validate: (c) => validateDiscount(c),
      targetTierId: async () => (slug ? loadActiveTierId(admin, slug) : null),
      priorRedemptions: (discountId) =>
        countSubjectRedemptions({
          discountId,
          subjectType: req.kind,
          tenantId: req.kind === "workspace" ? req.subjectId : null,
          talentProfileId: req.kind === "talent" ? req.subjectId : null,
        }),
    },
    req.kind,
    code,
  );
  if (!out.ok) return { error: PROMO_ERROR_MESSAGES[out.promoError].en, promoError: out.promoError };
  return { ...req, promo: out.promo };
}

export async function previewPlanChangeFor(
  kind: "talent" | "workspace",
  subjectId: string,
  toPlan: string,
  interval: unknown,
  promoCode?: unknown,
): Promise<PlanChangePreview> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Billing is not available yet.", code: "stripe" };
  const built = await buildRequest(kind, subjectId, toPlan, interval);
  if ("error" in built) return { ok: false, error: built.error, code: built.code };
  const req = await withPromo(built, promoCode);
  if ("promoError" in req) return { ok: false, error: req.error, code: "promo", promoError: req.promoError };
  const out = await previewPlanChange(stripe, req);
  if (!out.ok) logServerError("billing.planChange.preview", out.error);
  return out;
}

export async function confirmPlanChangeFor(
  kind: "talent" | "workspace",
  subjectId: string,
  toPlan: string,
  interval: unknown,
  prorationDate: unknown,
  promoCode?: unknown,
): Promise<PlanChangeConfirm> {
  const stripe = getStripe();
  if (!stripe) return { ok: false, error: "Billing is not available yet.", code: "stripe" };
  const built = await buildRequest(kind, subjectId, toPlan, interval);
  if ("error" in built) return { ok: false, error: built.error, code: built.code };
  const req = await withPromo(built, promoCode);
  if ("promoError" in req) return { ok: false, error: req.error, code: "promo", promoError: req.promoError };
  const out = await confirmPlanChange(stripe, req, prorationDate);
  if (!out.ok) logServerError("billing.planChange.confirm", out.error);
  else if (kind === "workspace") {
    // TUL-1737: any confirmed in-app plan change supersedes a stored downgrade keep-list (best effort; the webhook also
    // clears it on a tier increase).
    const sb = createServiceRoleClient();
    if (sb) {
      const cleared = await clearPendingDowngrade(sb, subjectId);
      if (!cleared.ok) logServerError("billing.planChange.clearPending", cleared.error);
    }
  }
  return out;
}

/** TUL-1518: tell Stripe about a workspace downgrade BEFORE anything local changes (see workspace-downgrade-stripe.ts). */
export async function applyWorkspaceDowngrade(
  tenantId: string,
  target: WorkspaceDowngradeTarget,
  /** TUL-1737: the owner's keep-list, stored with the pending change so the webhook archives at period end. */
  pending: PendingDowngrade,
): Promise<WorkspaceDowngradeStripeResult> {
  const out = await applyWorkspaceDowngradeAtStripe(tenantId, target, {
    async recordPending(id) {
      const sb = createServiceRoleClient();
      if (!sb) return { ok: false };
      const r = await recordPendingDowngrade(sb, id, pending);
      if (!r.ok) logServerError("billing.workspaceDowngrade.recordPending", r.error);
      return r.ok ? { ok: true } : { ok: false };
    },
    async readSubscriptionId(id) {
      const sb = createServiceRoleClient();
      if (!sb) throw new Error("no database client");
      const { data, error } = await sb.from("workspace_subscriptions").select("stripe_subscription_id, status").eq("tenant_id", id).maybeSingle();
      if (error) throw error;
      const row = data as { stripe_subscription_id?: string | null; status?: string | null } | null;
      if (!row?.stripe_subscription_id) return null;
      return isExistingSubscriptionStatus(row.status) ? row.stripe_subscription_id : null; // unpaid/incomplete/paused are existing (TUL-1737)
    },
    stripe: () => getStripe(),
    async resolvePriceId(plan, interval) {
      const price = await resolveWorkspacePriceId(plan as WorkspacePlanKey, toCatalogInterval(interval));
      return price?.trim() || null;
    },
    async cancelAtPeriodEnd(id) {
      const r = await cancelWorkspaceSubscriptionAtPeriodEnd(id);
      return r.ok ? { ok: true, effectiveAt: r.data.effectiveAt } : { ok: false, error: r.error, definite: r.definite };
    },
    async clearPending(id) {
      const sb = createServiceRoleClient();
      if (!sb) return;
      const r = await clearPendingDowngrade(sb, id);
      if (!r.ok) logServerError("billing.workspaceDowngrade.clearPending", r.error);
    },
    now: () => Date.now(),
  });
  if (!out.ok) logServerError("billing.workspaceDowngrade", out.error);
  return out;
}

"use server";

/**
 * TUL-831 · in-app workspace plan change. Same contract as the talent action:
 * preview then confirm with the preview's proration date. Requires the
 * manage_billing capability; the plan row is written only by the webhook.
 */
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { userHasCapability } from "@/lib/access";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { previewPlanChangeFor, confirmPlanChangeFor } from "@/lib/billing/plan-change.server";
import type { PlanChangeConfirm, PlanChangePreview } from "@/lib/billing/plan-change-policy";

async function ownTenantId(tenantSlug: string): Promise<string | { error: string }> {
  const session = await getCachedActorSession();
  if (!session.user) return { error: "Not authenticated." };
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return { error: "Workspace not found." };
  if (!(await userHasCapability("manage_billing", scope.tenantId))) {
    return { error: "You don't have permission to manage billing." };
  }
  return scope.tenantId;
}

export async function previewWorkspacePlanChange(
  tenantSlug: string,
  planKey: string,
  interval: string | null,
  /** TUL-833: optional promo code; re-validated against the catalog on the server. */
  promoCode?: string | null,
): Promise<PlanChangePreview> {
  const id = await ownTenantId(tenantSlug);
  if (typeof id !== "string") return { ok: false, error: id.error, code: "not_allowed" };
  return previewPlanChangeFor("workspace", id, planKey, interval, promoCode);
}

export async function confirmWorkspacePlanChange(
  tenantSlug: string,
  planKey: string,
  interval: string | null,
  prorationDate: number,
  promoCode?: string | null,
): Promise<PlanChangeConfirm> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: readOnly.error, code: "not_allowed" };
  const id = await ownTenantId(tenantSlug);
  if (typeof id !== "string") return { ok: false, error: id.error, code: "not_allowed" };
  return confirmPlanChangeFor("workspace", id, planKey, interval, prorationDate, promoCode);
}

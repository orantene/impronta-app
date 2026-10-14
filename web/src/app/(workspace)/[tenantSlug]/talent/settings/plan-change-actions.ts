"use server";

/**
 * TUL-831 · in-app talent plan change. Preview shows "You pay $X today" or
 * "Your plan changes on <date>"; confirm reuses the preview's proration date so
 * the charge equals the preview. The talent profile is resolved from the
 * session (owner check); the plan row is written only by the webhook.
 */
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { previewPlanChangeFor, confirmPlanChangeFor } from "@/lib/billing/plan-change.server";
import type { PlanChangeConfirm, PlanChangePreview } from "@/lib/billing/plan-change-policy";
import { loadTalentSelfProfile } from "../../_data-bridge";

async function ownTalentProfileId(tenantSlug: string): Promise<string | { error: string }> {
  const session = await getCachedActorSession();
  if (!session.user) return { error: "Not authenticated." };
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) return { error: "Workspace not found." };
  const profile = await loadTalentSelfProfile(session.user.id, scope.tenantId);
  if (!profile) return { error: "Talent profile not found." };
  return profile.id;
}

export async function previewTalentPlanChange(
  tenantSlug: string,
  planKey: string,
  interval: string | null,
): Promise<PlanChangePreview> {
  const id = await ownTalentProfileId(tenantSlug);
  if (typeof id !== "string") return { ok: false, error: id.error, code: "not_allowed" };
  return previewPlanChangeFor("talent", id, planKey, interval);
}

export async function confirmTalentPlanChange(
  tenantSlug: string,
  planKey: string,
  interval: string | null,
  prorationDate: number,
): Promise<PlanChangeConfirm> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: readOnly.error, code: "not_allowed" };
  const id = await ownTalentProfileId(tenantSlug);
  if (typeof id !== "string") return { ok: false, error: id.error, code: "not_allowed" };
  return confirmPlanChangeFor("talent", id, planKey, interval, prorationDate);
}

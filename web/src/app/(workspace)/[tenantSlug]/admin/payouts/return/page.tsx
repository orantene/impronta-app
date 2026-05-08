/**
 * Stripe Connect onboarding return route. Stripe redirects here after the
 * user finishes (or abandons) the hosted onboarding flow. We refresh the
 * agency's Stripe status to mirror whatever the user just submitted, then
 * redirect back to the Payouts settings page.
 *
 * Important: arriving here doesn't necessarily mean onboarding *succeeded* —
 * Stripe redirects on completion AND on abandonment. The page reads the
 * refreshed status and surfaces the right state on the main Payouts page.
 */

import { notFound, redirect } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { refreshAccountStatus } from "@/lib/payments/stripe-connect";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function StripeOnboardingReturnPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canEdit = await userHasCapability(scope.tenantId, "agency.workspace.edit");
  if (!canEdit) notFound();

  // Best-effort refresh. If Stripe is unreachable, the redirect still goes
  // through and the user sees stale-but-correct info on the Payouts page.
  try {
    await refreshAccountStatus(tenantSlug);
  } catch (err) {
    logServerError("admin.payouts.return.refresh", err);
  }

  redirect(`/${tenantSlug}/admin/payouts`);
}

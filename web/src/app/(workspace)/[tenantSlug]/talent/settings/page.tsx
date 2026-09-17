import { redirect } from "next/navigation";

import { verifyCheckoutReturn } from "@/lib/billing/checkout-return";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentSelfProfile } from "../../_data-bridge";
import { redirectLegacyTalentPath } from "@/lib/talent/legacy-talent-redirect";

export const dynamic = "force-dynamic";

export default async function LegacyTalentSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  // Stripe's talent success_url lands here. A verified return-to-spot token
  // (trial door) forwards to where the door opened; anything else follows
  // the legacy redirect exactly as before.
  if (sp.billing === "success" && typeof sp.return === "string") {
    const { tenantSlug } = await params;
    const [session, scope] = await Promise.all([getCachedActorSession(), getTenantPortalScopeBySlug(tenantSlug)]);
    if (session.user && scope) {
      const profile = await loadTalentSelfProfile(session.user.id, scope.tenantId);
      const back = profile ? verifyCheckoutReturn(sp.return, profile.id) : { ok: false as const };
      if (back.ok) redirect(back.path);
    }
  }
  await redirectLegacyTalentPath("settings", searchParams);
}

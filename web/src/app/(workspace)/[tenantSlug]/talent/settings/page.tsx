import { redirect } from "next/navigation";

import { verifyCheckoutReturn } from "@/lib/billing/checkout-return";
import { syncTalentCheckoutSession } from "@/lib/billing/checkout-session-sync.server";
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
  // TUL-836 session sync: re-read the subscription once and run the same
  // single writer as the webhook, so the plan shows even if the webhook is late.
  if (sp.billing === "success" && (typeof sp.return === "string" || typeof sp.session_id === "string")) {
    const { tenantSlug } = await params;
    const [session, scope] = await Promise.all([getCachedActorSession(), getTenantPortalScopeBySlug(tenantSlug)]);
    if (session.user && scope) {
      const profile = await loadTalentSelfProfile(session.user.id, scope.tenantId);
      if (profile && typeof sp.session_id === "string") {
        await syncTalentCheckoutSession({ sessionId: sp.session_id, ownerProfileId: profile.id, ownerUserId: session.user.id });
      }
      const back = profile && typeof sp.return === "string" ? verifyCheckoutReturn(sp.return, profile.id) : { ok: false as const };
      if (back.ok) redirect(back.path);
    }
  }
  await redirectLegacyTalentPath("settings", searchParams);
}

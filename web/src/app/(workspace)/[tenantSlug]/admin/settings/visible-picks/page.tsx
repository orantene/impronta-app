// Workspace Settings → Who stays visible (TUL-1591 (e)).
// The owner picks who stays on the public site when the roster is over the plan cap.
// Lives under the existing `settings` segment (like Collective): no rail slot.
// Hidden unless HUB_PLAN_CAP_PICKS_ENABLED=1, the flag that makes the directory honour picks.
import { notFound } from "next/navigation";

import { getRequestLocale } from "@/i18n/request-locale";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { loadVisiblePicks } from "@/lib/service-hub/visible-picks.server";
import { visiblePicksEnabled } from "@/lib/service-hub/visible-picks";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { VisiblePicksPanel } from "./VisiblePicksPanel";

export const dynamic = "force-dynamic";

export default async function VisiblePicksPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  if (!visiblePicksEnabled()) notFound();
  const { tenantSlug } = await params;
  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  const admin = createServiceRoleClient();
  const picks = admin ? await loadVisiblePicks(admin, scope.tenantId) : null;
  return (
    <main className="mx-auto max-w-3xl p-6">
      <VisiblePicksPanel locale={locale} tenantSlug={tenantSlug} picks={picks} />
    </main>
  );
}

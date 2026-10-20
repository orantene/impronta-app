// TUL-1442: "how you work with people", the one question that presets the hub settings.
// Standalone server page, registered in CANONICAL_ROUTE_MATCHERS so the admin shell yields.
import { notFound } from "next/navigation";

import { WorkStyleCard } from "@/components/admin/service-hub/WorkStyleCard";
import { getRequestLocale } from "@/i18n/request-locale";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { canSetWorkStyle, tradeForSeed } from "@/lib/service-hub/work-style";
import { loadWorkStyle } from "@/lib/service-hub/work-style.server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

export const dynamic = "force-dynamic";

export default async function WorkStylePage() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) notFound();
  const admin = createServiceRoleClient();
  if (!admin) notFound();
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  // Owner or admin only (it sets client prices, the split and who gets requests).
  const { data: member, error: roleErr } = await tenantScopedQuery(admin, "agency_memberships", guard.tenantId)
    .select("role")
    .eq("profile_id", guard.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (!roleErr && !canSetWorkStyle((member as { role?: string } | null)?.role)) notFound();
  const state = roleErr ? ({ kind: "unknown" } as const) : await loadWorkStyle(admin, guard.tenantId);
  return (
    <main className="mx-auto max-w-[820px] px-4 py-8">
      {state.kind === "unknown" ? (
        <p role="alert">{locale === "es" ? "No pudimos cargar esto. Inténtalo otra vez." : "We could not load this. Please try again."}</p>
      ) : (
        <WorkStyleCard initial={state.kind === "chosen" ? state.choice : null} trade={tradeForSeed(guard.tenantId)} locale={locale} />
      )}
    </main>
  );
}

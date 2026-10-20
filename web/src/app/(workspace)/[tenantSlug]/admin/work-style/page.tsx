// TUL-1442: "how you work with people", the one question that presets the hub settings.
// Standalone server page, registered in CANONICAL_ROUTE_MATCHERS so the admin shell yields.
import { notFound } from "next/navigation";

import { WorkStyleCard } from "@/components/admin/service-hub/WorkStyleCard";
import { getRequestLocale } from "@/i18n/request-locale";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { tradeForSeed } from "@/lib/service-hub/work-style";
import { loadWorkStyle } from "@/lib/service-hub/work-style.server";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function WorkStylePage() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) notFound();
  const admin = createServiceRoleClient();
  if (!admin) notFound();
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  const state = await loadWorkStyle(admin, guard.tenantId);
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

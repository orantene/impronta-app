import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { listFloor } from "@/lib/visits/floor";
import { TablesClient } from "./tables-client";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function TablesPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("view_dashboard", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const admin = createServiceRoleClient();
  if (!admin) notFound();

  const floor = await listFloor(admin, scope.tenantId);

  return (
    <main style={{ padding: "32px 28px", maxWidth: 1180, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>
        {tr("dashboard.tables.pageTitle")}
      </h1>
      <p style={{ color: "rgba(11,11,13,0.55)", marginTop: 6, marginBottom: 24 }}>
        {tr("dashboard.tables.pageIntro")}
      </p>
      {!floor.ok ? (
        <p>{tr("dashboard.tables.unavailable")}</p>
      ) : (
        <TablesClient
          tenantSlug={tenantSlug}
          tables={floor.tables}
          copy={{
            empty: tr("dashboard.tables.empty"),
            open: tr("dashboard.tables.open"),
            close: tr("dashboard.tables.close"),
            sale: tr("dashboard.tables.sale"),
            occupied: tr("dashboard.tables.occupied"),
            free: tr("dashboard.tables.free"),
            minSpend: tr("dashboard.tables.minSpend"),
            move: tr("dashboard.tables.move"),
            openTab: locale === "es" ? "Abrir cuenta" : "Open tab",
            tab: locale === "es" ? "Cuenta" : "Tab",
            table: locale === "es" ? "Mesa" : "Table",
          }}
        />
      )}
    </main>
  );
}

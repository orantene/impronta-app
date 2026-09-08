import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { loadWorkspaceOrders } from "../../_data-bridge/orders";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { isMoneyOwed } from "@/lib/orders/orders-list";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function SalesPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("view_dashboard", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const load = await loadWorkspaceOrders(scope.tenantId);

  return (
    <main style={{ padding: "32px 28px", maxWidth: 1180, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>
        {tr("dashboard.sales.pageTitle")}
      </h1>
      <p style={{ color: "rgba(11,11,13,0.55)", marginTop: 6, marginBottom: 24 }}>
        {tr("dashboard.sales.pageIntro")}
      </p>
      <p style={{ fontSize: 13, marginBottom: 20 }}>
        <Link href={`/${tenantSlug}/admin/orders`}>{tr("dashboard.sales.openOrders")}</Link>
        {" · "}
        <Link href={`/${tenantSlug}/admin/calendar`}>{tr("dashboard.sales.openCalendar")}</Link>
      </p>
      {!load.ok ? (
        <p>{tr("dashboard.orders.unavailableTitle")}</p>
      ) : load.rows.length === 0 ? (
        <p>{tr("dashboard.sales.empty")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "rgba(11,11,13,0.55)", fontSize: 12 }}>
              <th style={{ padding: "10px 12px" }}>{tr("dashboard.sales.colKind")}</th>
              <th style={{ padding: "10px 12px" }}>{tr("dashboard.orders.colCustomer")}</th>
              <th style={{ padding: "10px 12px", textAlign: "right" }}>{tr("dashboard.orders.colTotal")}</th>
              <th style={{ padding: "10px 12px" }}>{tr("dashboard.orders.colStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {load.rows.map((row) => (
              <tr key={row.id} style={{ borderTop: "1px solid rgba(24,24,27,0.08)" }}>
                <td style={{ padding: 12 }}>{row.sourceChannel}</td>
                <td style={{ padding: 12 }}>{row.customerName ?? tr("dashboard.orders.noCustomer")}</td>
                <td style={{ padding: 12, textAlign: "right" }}>
                  {formatOrderMoney(row.totalCents, row.currency)}
                  {isMoneyOwed(row) ? ` · ${tr("dashboard.orders.totalsOutstanding")}` : ""}
                </td>
                <td style={{ padding: 12 }}>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

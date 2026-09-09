import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { loadWorkspaceSalesActivity } from "../../_data-bridge/sales-activity";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { salesKindLabel, SALES_TYPE_CHIPS, type SalesKindFilter } from "@/lib/sales/activity-shape";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type Search = Promise<{ kind?: string }>;

function parseKind(raw: string | undefined): SalesKindFilter {
  if (
    raw === "order" ||
    raw === "booking" ||
    raw === "reservation" ||
    raw === "registration" ||
    raw === "admission" ||
    raw === "appointment" ||
    raw === "project"
  ) {
    return raw;
  }
  return "all";
}

export default async function SalesPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: Search;
}) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("view_dashboard", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const loc = locale === "es" ? "es" : "en";
  const kind = parseKind((await searchParams).kind);
  const load = await loadWorkspaceSalesActivity(scope.tenantId, tenantSlug, { kind });

  const filters: Array<{ id: SalesKindFilter; label: string }> = [
    { id: "all", label: loc === "es" ? "Toda la actividad" : "All activity" },
    ...SALES_TYPE_CHIPS.map((id) => ({ id: id as SalesKindFilter, label: salesKindLabel(id, loc) })),
  ];

  return (
    <main style={{ padding: "32px 28px", maxWidth: 1180, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>
        {tr("dashboard.sales.pageTitle")}
      </h1>
      <p style={{ color: "rgba(11,11,13,0.55)", marginTop: 6, marginBottom: 24 }}>
        {tr("dashboard.sales.pageIntro")}
      </p>
      <p style={{ fontSize: 13, marginBottom: 16 }}>
        <Link href={`/${tenantSlug}/admin/orders`}>{tr("dashboard.sales.openOrders")}</Link>
        {" · "}
        <Link href={`/${tenantSlug}/admin/calendar`}>{tr("dashboard.sales.openCalendar")}</Link>
      </p>
      <p style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, fontSize: 13 }}>
        {filters.map((filter) => (
          <Link
            key={filter.id}
            href={filter.id === "all" ? `/${tenantSlug}/admin/sales` : `/${tenantSlug}/admin/sales?kind=${filter.id}`}
            style={{ fontWeight: kind === filter.id ? 600 : 400 }}
          >
            {filter.label}
          </Link>
        ))}
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
              <tr key={`${row.kind}:${row.id}`} style={{ borderTop: "1px solid rgba(24,24,27,0.08)" }}>
                <td style={{ padding: 12 }}>
                  <Link href={row.href}>
                    {row.kind === "order" ? (row.title ?? salesKindLabel("order", loc)) : salesKindLabel(row.kind, loc)}
                  </Link>
                </td>
                <td style={{ padding: 12 }}>{row.customerName ?? tr("dashboard.orders.noCustomer")}</td>
                <td style={{ padding: 12, textAlign: "right" }}>
                  {row.totalCents <= 0
                    ? loc === "es"
                      ? "Gratis"
                      : "Free"
                    : formatOrderMoney(row.totalCents, row.currency)}
                  {row.owed ? ` · ${tr("dashboard.orders.totalsOutstanding")}` : ""}
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

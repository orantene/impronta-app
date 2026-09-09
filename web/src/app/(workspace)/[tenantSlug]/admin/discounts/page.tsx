import { notFound } from "next/navigation";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { DiscountForm } from "./discount-form";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function DiscountsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const canView = await userHasCapability("view_dashboard", scope.tenantId);
  if (!canView) notFound();
  const canWrite = await userHasCapability("manage_billing", scope.tenantId);

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const admin = createServiceRoleClient();
  const { data, error } = admin
    ? await admin
        .from("tenant_promo_codes")
        .select("id, code, kind, value, is_active, max_redemptions, ends_at")
        .eq("tenant_id", scope.tenantId)
        .order("created_at", { ascending: false })
    : { data: null, error: new Error("no admin") };

  return (
    <main style={{ padding: "32px 28px", maxWidth: 880, margin: "0 auto" }}>
      <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>
        {tr("dashboard.discounts.pageTitle")}
      </h1>
      <p style={{ color: "rgba(11,11,13,0.55)", marginTop: 6, marginBottom: 24 }}>
        {tr("dashboard.discounts.pageIntro")}
      </p>
      {error ? (
        <p>{tr("dashboard.discounts.unavailable")}</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, marginBottom: 28 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "rgba(11,11,13,0.55)", fontSize: 12 }}>
              <th style={{ padding: "10px 12px" }}>{tr("dashboard.discounts.colCode")}</th>
              <th style={{ padding: "10px 12px" }}>{tr("dashboard.discounts.colValue")}</th>
              <th style={{ padding: "10px 12px" }}>{tr("dashboard.discounts.colActive")}</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: 16 }}>
                  {tr("dashboard.discounts.empty")}
                </td>
              </tr>
            ) : (
              (data ?? []).map((row) => (
                <tr key={row.id as string} style={{ borderTop: "1px solid rgba(24,24,27,0.08)" }}>
                  <td style={{ padding: 12 }}>{row.code as string}</td>
                  <td style={{ padding: 12 }}>
                    {row.kind === "percent" ? `${row.value as number}%` : row.value}
                  </td>
                  <td style={{ padding: 12 }}>{row.is_active ? tr("dashboard.discounts.on") : tr("dashboard.discounts.off")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
      {canWrite ? <DiscountForm /> : <p>{tr("dashboard.discounts.readOnly")}</p>}
    </main>
  );
}

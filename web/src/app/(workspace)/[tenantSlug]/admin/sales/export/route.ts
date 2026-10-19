// Sales-by-item CSV export. Tenant-scoped: the slug resolves to ONE workspace
// and the caller must hold `view_dashboard` THERE (the same capability the
// Sales page needs), not the global staff role. Read only.

import { NextResponse, type NextRequest } from "next/server";

import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { userHasCapability } from "@/lib/access";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { salesByItemCsv } from "@/lib/sales/csv";
import { parseSalesMethod, parseSalesPeriod, salesPeriodRange } from "@/lib/sales/period";
import { tenantTimezone } from "@/lib/spaces/venues";
import { loadSalesByItem } from "../../../_data-bridge/sales-by-item";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await ctx.params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await userHasCapability("view_dashboard", scope.tenantId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const period = parseSalesPeriod(request.nextUrl.searchParams.get("period"));
  const method = parseSalesMethod(request.nextUrl.searchParams.get("method"));
  const zone = await tenantTimezone(scope.tenantId);
  const load = await loadSalesByItem(scope.tenantId, { range: salesPeriodRange(period, new Date(), zone), method });
  if (!load.ok) return NextResponse.json({ error: "Unavailable" }, { status: 503 });

  const tr = await createTranslator(await getRequestLocale());
  const headers = ["csvItem", "csvQuantity", "csvGross", "csvRefunded", "csvNet", "csvOrders", "csvCurrency"].map((k) =>
    tr(`dashboard.sales.${k}`),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(salesByItemCsv(load.rows, headers), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sales-by-item-${stamp}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

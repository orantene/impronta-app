import "server-only";

/**
 * TUL-1466: the member's net sales in one Mexico City month of THIS workspace, the base of a percentage rent.
 * Filtered in SQL by the member's own lines (never the workspace's whole month): lines of paid, fulfilled or partially
 * refunded orders in the plan currency, net of what was refunded on them, read page by page. The rent invoices
 * themselves (source_page 'rent') are never part of the base. null = unreadable or too big to read safely.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { nextRentPeriodOf, zonedMonthStartUtc } from "./rent-cycle";
import { PAGE_SIZE, sumSalesPages } from "./rent-sales-paging";

export async function loadMemberSalesBase(
  admin: SupabaseClient,
  p: { tenantId: string; talentProfileId: string; period: string; currency: string },
): Promise<number | null> {
  try {
    const from = zonedMonthStartUtc(p.period).toISOString();
    const to = zonedMonthStartUtc(nextRentPeriodOf(p.period)).toISOString();
    return await sumSalesPages(async (start, end) => {
      const { data, error } = await tenantScopedQuery(admin, "order_lines", p.tenantId)
        .select("total_cents, refunded_cents, orders!inner(status, currency, created_at, source_page)")
        .eq("talent_profile_id", p.talentProfileId)
        .in("orders.status", ["paid", "fulfilled", "partially_refunded"])
        .eq("orders.currency", p.currency)
        .gte("orders.created_at", from)
        .lt("orders.created_at", to)
        .or("source_page.is.null,source_page.neq.rent", { referencedTable: "orders" })
        .order("id", { ascending: true })
        .range(start, Math.min(end, start + PAGE_SIZE - 1));
      if (error || !Array.isArray(data)) {
        logServerError("rent.salesBase.lines", error);
        return { rows: null, error: true };
      }
      return { rows: data as Array<{ total_cents: number | string; refunded_cents: number | string | null }>, error: false };
    });
  } catch (err) {
    logServerError("rent.salesBase", err);
    return null;
  }
}

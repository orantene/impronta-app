import "server-only";

/**
 * TUL-1466: the member's net sales in one month of THIS workspace, the base of a percentage rent. Paid or fulfilled
 * orders created in the UTC month, in the plan's currency, counting only the member's own lines, net of what was
 * refunded on them. The rent invoices themselves (source_page 'rent') are never part of the base. null = unreadable.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

export async function loadMemberSalesBase(
  admin: SupabaseClient,
  p: { tenantId: string; talentProfileId: string; period: string; currency: string },
): Promise<number | null> {
  try {
    const [y, m] = p.period.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1)).toISOString();
    const to = new Date(Date.UTC(y, m, 1)).toISOString();
    const { data: orders, error } = await tenantScopedQuery(admin, "orders", p.tenantId)
      .select("id, source_page")
      .in("status", ["paid", "fulfilled"])
      .eq("currency", p.currency)
      .gte("created_at", from)
      .lt("created_at", to);
    if (error || !Array.isArray(orders)) {
      logServerError("rent.salesBase.orders", error);
      return null;
    }
    const ids = (orders as Array<{ id: string; source_page: string | null }>).filter((o) => o.source_page !== "rent").map((o) => o.id);
    if (ids.length === 0) return 0;
    let total = 0;
    // Chunked: an `in` list of ids stays small enough for a URL.
    for (let i = 0; i < ids.length; i += 150) {
      const { data: lines, error: lErr } = await tenantScopedQuery(admin, "order_lines", p.tenantId)
        .select("total_cents, refunded_cents")
        .eq("talent_profile_id", p.talentProfileId)
        .in("order_id", ids.slice(i, i + 150));
      if (lErr || !Array.isArray(lines)) {
        logServerError("rent.salesBase.lines", lErr);
        return null;
      }
      for (const l of lines as Array<{ total_cents: number | string; refunded_cents: number | string | null }>) {
        total += Math.max(0, (Number(l.total_cents) || 0) - (Number(l.refunded_cents) || 0));
      }
    }
    return Number.isInteger(total) ? total : null;
  } catch (err) {
    logServerError("rent.salesBase", err);
    return null;
  }
}

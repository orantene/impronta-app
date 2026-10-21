import "server-only";

/**
 * TUL-1717 · The I/O side of collecting a missed percentage by payment link: the catch-up table, the order on the POS
 * rails (reusing the rent order/link builders) and the read of the plan's missed months. Every query is tenant-scoped.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import type { CatchupDeps, CatchupRow } from "./rent-percent-catchup";
import { buildRentIssueDeps } from "./rent-store.server";

const COLUMNS = "id, plan_id, sales_month, amount_cents, currency, order_id, payment_link_code, status";
type DbRow = { id: string; plan_id: string; sales_month: string; amount_cents: number; currency: string; order_id: string | null; payment_link_code: string | null; status: CatchupRow["status"] };
const toRow = (r: DbRow): CatchupRow => ({ id: r.id, planId: r.plan_id, salesMonth: r.sales_month, amountCents: r.amount_cents, currency: r.currency, orderId: r.order_id, status: r.status });

export function buildCatchupDeps(admin: SupabaseClient, ctx: { actorUserId: string; publicOrigin: string }): Omit<CatchupDeps, "gate"> {
  const rent = buildRentIssueDeps(admin, ctx);
  return {
    loadPlan: rent.loadPlan,
    loadSalesBase: rent.loadSalesBase,
    mintLink: rent.mintLink,

    async loadMissedMonths(planId, tenantId) {
      const { data, error } = await tenantScopedQuery(admin, "studio_rent_plans", tenantId).select("autopay_percent_missed").eq("id", planId).maybeSingle();
      if (error) {
        logServerError("rent.catchup.missed", error);
        return null;
      }
      return ((data as { autopay_percent_missed?: string[] | null } | null)?.autopay_percent_missed ?? []) as string[];
    },

    async claim(row) {
      const find = async () => {
        const { data, error } = await tenantScopedQuery(admin, "studio_rent_percent_catchups", row.tenantId).select(`${COLUMNS}`).eq("plan_id", row.planId).eq("sales_month", row.salesMonth).maybeSingle();
        if (error) logServerError("rent.catchup.find", error);
        return error ? null : ((data as DbRow | null) ?? null);
      };
      let existing = await find();
      if (!existing) {
        const { error } = await tenantScopedQuery(admin, "studio_rent_percent_catchups", row.tenantId).insert({
          plan_id: row.planId,
          talent_profile_id: row.talentProfileId,
          sales_month: row.salesMonth,
          amount_cents: row.amountCents,
          currency: row.currency,
          status: "issuing",
        });
        // The unique (plan_id, sales_month) decides a race; the loser re-reads the winner.
        if (error && (error as { code?: string }).code !== "23505") {
          logServerError("rent.catchup.insert", error);
          return null;
        }
        existing = await find();
      }
      if (!existing) return null;
      // The payment link is the truth for "paid".
      if (existing.status === "issued" && existing.payment_link_code) {
        const { data: link } = await tenantScopedQuery(admin, "payment_links", row.tenantId).select("status").eq("code", existing.payment_link_code).maybeSingle();
        if ((link as { status?: string } | null)?.status === "paid") {
          await tenantScopedQuery(admin, "studio_rent_percent_catchups", row.tenantId).update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", existing.id).neq("status", "paid");
          existing = { ...existing, status: "paid" };
        }
      }
      return toRow(existing);
    },

    async createOrder(input) {
      // Same POS rails and line builder as the monthly rent; the member accepted this percentage, so the custom-amount
      // approval is recorded for the line (operation key per row: a replay is a no-op).
      const made = await rent.createOrder({ invoiceId: `pct-${input.rowId}`, matchesAcceptedTerms: true, tenantId: input.tenantId, currency: input.currency, label: input.label, amountCents: input.amountCents });
      return made;
    },

    async saveOrder(rowId, orderId) {
      const { data, error } = await admin.from("studio_rent_percent_catchups").update({ order_id: orderId }).eq("id", rowId).is("order_id", null).select("id");
      if (error) logServerError("rent.catchup.saveOrder", error);
      return !error && Array.isArray(data) && data.length === 1;
    },

    async readOrderId(rowId) {
      const { data, error } = await admin.from("studio_rent_percent_catchups").select("order_id").eq("id", rowId).maybeSingle();
      if (error) logServerError("rent.catchup.readOrderId", error);
      return (data as { order_id?: string | null } | null)?.order_id ?? null;
    },

    async markIssued(rowId, code) {
      const { error } = await admin
        .from("studio_rent_percent_catchups")
        .update({ status: "issued", payment_link_code: code, issued_at: new Date().toISOString() })
        .eq("id", rowId)
        .in("status", ["issuing", "issued"]);
      if (error) logServerError("rent.catchup.markIssued", error);
      return !error;
    },
  };
}

/** For the owner's rent card: each missed month and what happened to its catch-up, or null when unreadable. */
export async function loadMissedPercentViews(
  admin: SupabaseClient,
  tenantId: string,
  planIds: readonly string[],
): Promise<Map<string, Array<{ month: string; state: "open" | "waiting" | "paid"; code: string | null }>> | null> {
  const out = new Map<string, Array<{ month: string; state: "open" | "waiting" | "paid"; code: string | null }>>();
  if (planIds.length === 0) return out;
  try {
    const { data: plans, error } = await tenantScopedQuery(admin, "studio_rent_plans", tenantId).select("id, autopay_percent_missed").in("id", [...planIds]);
    if (error) throw error;
    const { data: rows, error: cErr } = await tenantScopedQuery(admin, "studio_rent_percent_catchups", tenantId).select("plan_id, sales_month, status, payment_link_code").in("plan_id", [...planIds]);
    if (cErr) throw cErr;
    const byKey = new Map((rows ?? []).map((r) => [`${(r as { plan_id: string }).plan_id}:${(r as { sales_month: string }).sales_month}`, r as { status: string; payment_link_code: string | null }]));
    for (const p of (plans ?? []) as Array<{ id: string; autopay_percent_missed: string[] | null }>) {
      const months = [...(p.autopay_percent_missed ?? [])].sort().reverse();
      if (months.length === 0) continue;
      out.set(p.id, months.map((month) => {
        const c = byKey.get(`${p.id}:${month}`);
        return { month, state: c?.status === "paid" ? "paid" : c?.status === "issued" ? "waiting" : "open", code: c?.payment_link_code ?? null };
      }));
    }
    return out;
  } catch (err) {
    logServerError("rent.catchup.views", err);
    return null;
  }
}

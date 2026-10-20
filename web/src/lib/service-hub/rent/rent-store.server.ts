import "server-only";

/**
 * TUL-1376: the database side of rent issuing. Every read/write is scoped to one workspace
 * (`tenantScopedQuery`); the invoice row is the idempotency anchor and the payment link's own
 * state is the truth for "paid" (a paid link flips the invoice to paid here, on the next touch).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { addCustomLine } from "@/lib/pos/custom-line";
import { createDraftOrder } from "@/lib/pos/draft";
import { createPaymentLink } from "@/lib/payments/links";
import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import type { RentPlan, RentPlanStatus } from "./rent-cycle";
import type { RentInvoiceRow, RentIssueDeps } from "./rent-issue";

type PlanDbRow = {
  id: string;
  tenant_id: string;
  talent_profile_id: string;
  monthly_rent_cents: number;
  currency: string;
  starts_on: string;
  status: RentPlanStatus;
  accepted_at: string | null;
};
type InvoiceDbRow = {
  id: string;
  plan_id: string;
  period: string;
  amount_cents: number;
  currency: string;
  order_id: string | null;
  payment_link_code: string | null;
  status: RentInvoiceRow["status"];
};

export const PLAN_COLUMNS = "id, tenant_id, talent_profile_id, monthly_rent_cents, currency, starts_on, status, accepted_at";
const INVOICE_COLUMNS = "id, plan_id, period, amount_cents, currency, order_id, payment_link_code, status";

export function planFromRow(r: PlanDbRow): RentPlan {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    talentProfileId: r.talent_profile_id,
    monthlyRentCents: r.monthly_rent_cents,
    currency: r.currency,
    startsOn: r.starts_on,
    status: r.status,
    acceptedAt: r.accepted_at,
  };
}

function invoiceFromRow(r: InvoiceDbRow): RentInvoiceRow {
  return { id: r.id, planId: r.plan_id, period: r.period, amountCents: r.amount_cents, currency: r.currency, orderId: r.order_id, status: r.status };
}

export function buildRentIssueDeps(
  admin: SupabaseClient,
  ctx: { actorUserId: string; publicOrigin: string },
): Pick<RentIssueDeps, "loadPlan" | "claimInvoice" | "createOrder" | "saveOrder" | "mintLink" | "markIssued"> {
  return {
    async loadPlan(planId, tenantId) {
      const { data, error } = await tenantScopedQuery(admin, "studio_rent_plans", tenantId).select(PLAN_COLUMNS).eq("id", planId).maybeSingle();
      if (error) {
        logServerError("rent.loadPlan", error);
        return null;
      }
      return data ? planFromRow(data as PlanDbRow) : null;
    },

    async claimInvoice(row) {
      const find = async () => {
        const { data, error } = await tenantScopedQuery(admin, "studio_rent_invoices", row.tenantId)
          .select(INVOICE_COLUMNS)
          .eq("plan_id", row.planId)
          .eq("period", row.period)
          .maybeSingle();
        if (error) logServerError("rent.claimInvoice.find", error);
        return error ? null : ((data as InvoiceDbRow | null) ?? null);
      };
      let existing = await find();
      if (!existing) {
        // Insert-if-absent: the unique (plan_id, period) decides a race; the loser re-reads the winner.
        const { error } = await tenantScopedQuery(admin, "studio_rent_invoices", row.tenantId).insert({
          plan_id: row.planId,
          talent_profile_id: row.talentProfileId,
          period: row.period,
          amount_cents: row.amountCents,
          currency: row.currency,
          status: "issuing",
        });
        if (error && (error as { code?: string }).code !== "23505") {
          logServerError("rent.claimInvoice.insert", error);
          return null;
        }
        existing = await find();
      }
      if (!existing) return null;
      // The payment link is the truth for "paid".
      if (existing.status === "issued" && existing.payment_link_code) {
        const { data: link } = await tenantScopedQuery(admin, "payment_links", row.tenantId).select("status").eq("code", existing.payment_link_code).maybeSingle();
        if ((link as { status?: string } | null)?.status === "paid") {
          await tenantScopedQuery(admin, "studio_rent_invoices", row.tenantId)
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", existing.id)
            .neq("status", "paid");
          existing = { ...existing, status: "paid" };
        }
      }
      return invoiceFromRow(existing);
    },

    async createOrder(input) {
      // A staff-made sale on the point-of-sale rails (source_page 'rent' labels it); no new channel to teach the money code.
      const draft = await createDraftOrder(admin, { tenantId: input.tenantId, actorUserId: ctx.actorUserId, currency: input.currency, sourceChannel: "pos", context: "rent" });
      if (!draft.ok) return { ok: false };
      const line = await addCustomLine(admin, {
        tenantId: input.tenantId,
        orderId: draft.orderId,
        label: input.label,
        amountCents: input.amountCents,
        operatorUserId: ctx.actorUserId,
      });
      if (!line.ok) return { ok: false };
      return { ok: true, orderId: draft.orderId, needsApproval: line.needsApproval };
    },

    async saveOrder(invoiceId, orderId) {
      const { error } = await admin.from("studio_rent_invoices").update({ order_id: orderId }).eq("id", invoiceId).is("order_id", null);
      if (error) logServerError("rent.saveOrder", error);
      return !error;
    },

    async mintLink(input) {
      const r = await createPaymentLink(admin, {
        tenantId: input.tenantId,
        orderId: input.orderId,
        amountCents: input.amountCents,
        idempotencyKey: input.idempotencyKey,
        actorUserId: ctx.actorUserId,
        publicOrigin: ctx.publicOrigin,
      });
      return r.ok ? { ok: true, code: r.code, url: r.url } : { ok: false, reason: r.reason };
    },

    async markIssued(invoiceId, code) {
      const { error } = await admin
        .from("studio_rent_invoices")
        .update({ status: "issued", payment_link_code: code, issued_at: new Date().toISOString() })
        .eq("id", invoiceId)
        .in("status", ["issuing", "issued"]);
      if (error) logServerError("rent.markIssued", error);
      return !error;
    },
  };
}

"use server";

/**
 * TUL-1646: the studio OWNER records that a month's rent was paid in cash or by bank transfer. No Tulala fee (the
 * money never went through Tulala). The month's open payment link is closed first; on automatic payments the month's
 * card invoice is voided if it exists and skipped by the webhook if it does not exist yet. A month already paid
 * (link, card or outside) is refused. Audited with who, how and how much.
 */
import { revalidatePath } from "next/cache";
import { logWorkspaceAudit } from "@/lib/audit/workspace-audit";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { cancelPaymentLink } from "@/lib/payments/links";
import { logServerError } from "@/lib/server/safe-error";
import type { StripeAccountKey } from "@/lib/stripe/client";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { ownerGuard } from "./rent-owner.server";
import { skipAutopayForOutsideMonth } from "./rent-outside-autopay.server";
import { decideMarkPaidOutside, type OutsideMethod, type OutsideRefusal } from "./rent-outside";
import { PLAN_COLUMNS, planFromRow } from "./rent-store.server";

export type MarkPaidOutsideResult =
  | { ok: true }
  | { ok: false; reason: OutsideRefusal | "unauthenticated" | "owner_only" | "not_found" | "link_already_paid" | "autopay_unavailable" | "unavailable" };

export async function markRentPaidOutside(input: {
  planId: string;
  period: string;
  method: OutsideMethod;
  amountCents: number;
  note?: string;
}): Promise<MarkPaidOutsideResult> {
  await requireNotImpersonating();
  try {
    const g = await ownerGuard();
    if (!g.ok) return g;

    const { data: row } = await tenantScopedQuery(g.admin, "studio_rent_plans", g.tenantId)
      .select(`${PLAN_COLUMNS}, stripe_subscription_id, autopay_platform, autopay_skip_periods`)
      .eq("id", input.planId)
      .maybeSingle();
    if (!row) return { ok: false, reason: "not_found" };
    const plan = planFromRow(row as Parameters<typeof planFromRow>[0]);
    const extra = row as { stripe_subscription_id?: string | null; autopay_platform?: StripeAccountKey | null; autopay_skip_periods?: string[] | null };

    const { data: inv } = await tenantScopedQuery(g.admin, "studio_rent_invoices", g.tenantId)
      .select("id, status, payment_link_code")
      .eq("plan_id", plan.id)
      .eq("period", input.period)
      .maybeSingle();
    const existing = inv as { id: string; status: string; payment_link_code: string | null } | null;

    const verdict = decideMarkPaidOutside({ plan, period: input.period, method: input.method, amountCents: input.amountCents, existingStatus: existing?.status ?? null, now: new Date(), invoiceCreatedSubscribed: process.env.RENT_AUTOPAY_INVOICE_CREATED_SUBSCRIBED === "1" });
    if (!verdict.ok) return verdict;

    // 1. Close the month's open payment link so it cannot be paid on top.
    if (existing?.payment_link_code) {
      const { data: link } = await tenantScopedQuery(g.admin, "payment_links", g.tenantId).select("id, status").eq("code", existing.payment_link_code).maybeSingle();
      const l = link as { id: string; status: string } | null;
      if (l && l.status === "paid") return { ok: false, reason: "link_already_paid" };
      if (l && l.status === "open") {
        const closed = await cancelPaymentLink(g.admin, { tenantId: g.tenantId, linkId: l.id });
        if (!closed.ok && closed.reason !== "not_found") return { ok: false, reason: closed.reason === "already_paid" ? "link_already_paid" : "unavailable" };
      }
    }

    // 2. Automatic payments: this month's card charge must not happen.
    const stopped = await skipAutopayForOutsideMonth(g.admin, {
      tenantId: g.tenantId,
      plan,
      period: input.period,
      subscriptionId: extra.stripe_subscription_id ?? null,
      platform: extra.autopay_platform ?? null,
      skipPeriods: extra.autopay_skip_periods ?? [],
    });
    if (!stopped) return { ok: false, reason: "autopay_unavailable" };

    // 3. Record the month as paid outside.
    const now = new Date().toISOString();
    const { error } = await tenantScopedQuery(g.admin, "studio_rent_invoices", g.tenantId).upsert(
      {
        plan_id: plan.id,
        talent_profile_id: plan.talentProfileId,
        period: input.period,
        amount_cents: input.amountCents,
        currency: plan.currency,
        status: "paid",
        source: "outside",
        paid_outside_method: input.method,
        paid_outside_note: (input.note ?? "").trim().slice(0, 300) || null,
        marked_by: g.userId,
        paid_at: now,
      },
      { onConflict: "plan_id,period" },
    );
    if (error) {
      logServerError("rent.outside.write", error);
      return { ok: false, reason: "unavailable" };
    }
    await logWorkspaceAudit({
      tenantId: g.tenantId,
      category: "billing",
      action: "workspace.rent_invoice.paid_outside",
      summary: `Recorded a month of station rent as paid outside Tulala (${input.method})`,
      targetType: "studio_rent_plan",
      targetId: plan.id,
      metadata: { period: input.period, method: input.method, amount_cents: input.amountCents, currency: plan.currency },
    });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    logServerError("rent.outside", err);
    return { ok: false, reason: "unavailable" };
  }
}

/**
 * TUL-1376 · Issue one month's rent invoice (deps-injected, no DB/Stripe imports).
 *
 * Sequence, safe to repeat at any point:
 *   gate (flag + TEST key) -> plan decision -> claim the (plan, month) row (insert-if-absent)
 *   -> order + one rent line (once) -> payment link (idempotent key) -> mark issued.
 * A second click, a retry after a crash or a replay lands on the same invoice row, reuses its
 * order and gets the same link. The amount is the plan's rent frozen on the invoice row.
 */
import { decideRentIssue, isRentPeriod, matchesAcceptedTerms, rentLineLabel, type RentIssueRefusal, type RentPlan } from "./rent-cycle";
import { rentBillingGate } from "./rent-gate";

export type RentInvoiceRow = {
  id: string;
  planId: string;
  period: string;
  amountCents: number;
  currency: string;
  orderId: string | null;
  status: "issuing" | "issued" | "paid" | "failed" | "void";
};

export type RentIssueDeps = {
  gate?: () => ReturnType<typeof rentBillingGate>;
  now?: () => Date;
  loadPlan(planId: string, tenantId: string): Promise<RentPlan | null>;
  /** The member's net sales in the month in this workspace and currency; null = could not be read. Asked only for a percentage plan. */
  loadSalesBase(q: { tenantId: string; talentProfileId: string; period: string; currency: string }): Promise<number | null>;
  /** Insert-if-absent on (plan, period); returns the row that now exists (existing wins). */
  claimInvoice(row: {
    planId: string;
    tenantId: string;
    talentProfileId: string;
    period: string;
    amountCents: number;
    currency: string;
  }): Promise<RentInvoiceRow | null>;
  createOrder(input: {
    invoiceId: string;
    /** The invoice is exactly what the member accepted: the custom-amount approval is recorded for it. */
    matchesAcceptedTerms: boolean;
    tenantId: string;
    currency: string;
    label: string;
    amountCents: number;
  }): Promise<{ ok: true; orderId: string; needsApproval: boolean } | { ok: false }>;
  /** Set the invoice's order only if it has none. false = 0 rows updated (another request won). */
  saveOrder(invoiceId: string, orderId: string): Promise<boolean>;
  /** The order the winner stored, or null. */
  readOrderId(invoiceId: string): Promise<string | null>;
  mintLink(input: {
    tenantId: string;
    orderId: string;
    amountCents: number;
    idempotencyKey: string;
  }): Promise<{ ok: true; code: string; url: string } | { ok: false; reason: string }>;
  /**
   * issuing -> issued with the link code, ONLY while the row is still a link row that is not paid (TUL-1750).
   * "lost_race" = 0 rows updated: a paid automatic payment (or an outside entry) took the month between the mint and now.
   * "error" = the write itself failed (retryable; the idempotent mint hands back the same link).
   */
  markIssued(invoiceId: string, code: string): Promise<"issued" | "lost_race" | "error">;
  /** Cancel the link just minted for a month that is no longer ours. true = no live link remains. */
  voidMintedLink(tenantId: string, code: string): Promise<boolean>;
};

export type RentIssueResult =
  | { ok: true; invoiceId: string; code: string; url: string; already: boolean }
  | {
      ok: false;
      reason:
        | RentIssueRefusal
        | "disabled"
        | "not_test_mode"
        | "plan_not_found"
        | "already_paid"
        | "void"
        | "needs_approval"
        | "unavailable";
    };

export function rentLinkKey(invoiceId: string): string {
  return `rent:${invoiceId}`;
}

export async function issueRentInvoice(
  input: { tenantId: string; planId: string; period: string; locale: "en" | "es" },
  deps: RentIssueDeps,
): Promise<RentIssueResult> {
  const gate = (deps.gate ?? rentBillingGate)();
  if (!gate.ok) return { ok: false, reason: gate.reason };

  const plan = await deps.loadPlan(input.planId, input.tenantId);
  if (!plan || plan.tenantId !== input.tenantId) return { ok: false, reason: "plan_not_found" };

  const salesBaseCents = plan.percentBps > 0 && isRentPeriod(input.period)
    ? await deps.loadSalesBase({ tenantId: plan.tenantId, talentProfileId: plan.talentProfileId, period: input.period, currency: plan.currency })
    : null;
  const decision = decideRentIssue({ plan, period: input.period, now: (deps.now ?? (() => new Date()))(), salesBaseCents });
  if (!decision.ok) return decision;

  const invoice = await deps.claimInvoice({
    planId: plan.id,
    tenantId: plan.tenantId,
    talentProfileId: plan.talentProfileId,
    period: input.period,
    amountCents: decision.amountCents,
    currency: decision.currency,
  });
  if (!invoice) return { ok: false, reason: "unavailable" };
  if (invoice.status === "paid") return { ok: false, reason: "already_paid" };
  if (invoice.status === "void") return { ok: false, reason: "void" };

  // From here the invoice row (not the plan) is the source of the amount.
  let orderId = invoice.orderId;
  if (!orderId) {
    const order = await deps.createOrder({
      invoiceId: invoice.id,
      matchesAcceptedTerms: matchesAcceptedTerms(plan, invoice),
      tenantId: plan.tenantId,
      currency: invoice.currency,
      label: rentLineLabel(invoice.period, input.locale),
      amountCents: invoice.amountCents,
    });
    if (!order.ok) return { ok: false, reason: "unavailable" };
    if (await deps.saveOrder(invoice.id, order.orderId)) {
      orderId = order.orderId;
      if (order.needsApproval) return { ok: false, reason: "needs_approval" };
    } else {
      // Lost the race: the invoice already has the winner's order. Use it; ours is never linked.
      const winner = await deps.readOrderId(invoice.id);
      if (!winner) return { ok: false, reason: "unavailable" };
      orderId = winner;
    }
  }

  const link = await deps.mintLink({
    tenantId: plan.tenantId,
    orderId,
    amountCents: invoice.amountCents,
    idempotencyKey: rentLinkKey(invoice.id),
  });
  if (!link.ok) return { ok: false, reason: "unavailable" };
  const marked = await deps.markIssued(invoice.id, link.code);
  if (marked === "lost_race") {
    // An automatic payment (or an outside entry) took this month while the link was being minted: the row is no longer a
    // link row, so the link must not live. Cancel it; if that cannot be confirmed, the store logs it for the owner.
    await deps.voidMintedLink(plan.tenantId, link.code);
    return { ok: false, reason: "unavailable" };
  }
  if (marked !== "issued") return { ok: false, reason: "unavailable" };
  return { ok: true, invoiceId: invoice.id, code: link.code, url: link.url, already: invoice.status === "issued" };
}

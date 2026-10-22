/**
 * TUL-1717 · Bill a month's percentage of sales that the automatic invoice could not carry, through the ordinary
 * payment-link path (deps-injected, no DB/Stripe imports; same shape as rent-issue.ts). The key is (plan, SALES month) in
 * its own table, because the (plan, month) rent row is taken by that month's fixed rent.
 *
 *   gate -> plan (accepted) -> the month is on the plan's missed list -> sales base -> percentage amount
 *   -> claim the (plan, month) row (insert-if-absent) -> order + one line (once) -> payment link (idempotent) -> issued.
 *
 * Safe to repeat at any point: a second click, a retry or a replay lands on the same row, order and link. A month that is
 * already paid is refused, so it is billed once.
 */
import { computeRentAmount, isRentPeriod, type RentPlan } from "./rent-cycle";
import { rentBillingGate } from "./rent-gate";

export type CatchupRow = {
  id: string;
  planId: string;
  salesMonth: string;
  amountCents: number;
  currency: string;
  orderId: string | null;
  status: "issuing" | "issued" | "paid" | "void";
};

export type CatchupRefusal =
  | "disabled"
  | "not_test_mode"
  | "plan_not_found"
  | "bad_period"
  | "not_accepted"
  | "not_a_percentage_plan"
  | "not_missed"
  | "sales_unavailable"
  | "nothing_due"
  | "already_paid"
  | "void"
  | "unavailable";

export type CatchupDeps = {
  gate?: () => ReturnType<typeof rentBillingGate>;
  loadPlan(planId: string, tenantId: string): Promise<RentPlan | null>;
  /** The months marked as not billed by the automatic invoice; null = could not be read. */
  loadMissedMonths(planId: string, tenantId: string): Promise<string[] | null>;
  loadSalesBase(q: { tenantId: string; talentProfileId: string; period: string; currency: string }): Promise<number | null>;
  /** Insert-if-absent on (plan, sales month); returns the row that now exists (existing wins, and a paid link is reconciled). */
  claim(row: { planId: string; tenantId: string; talentProfileId: string; salesMonth: string; amountCents: number; currency: string }): Promise<CatchupRow | null>;
  createOrder(input: { rowId: string; tenantId: string; currency: string; label: string; amountCents: number }): Promise<{ ok: true; orderId: string; needsApproval: boolean } | { ok: false }>;
  saveOrder(rowId: string, orderId: string): Promise<boolean>;
  readOrderId(rowId: string): Promise<string | null>;
  mintLink(input: { tenantId: string; orderId: string; amountCents: number; idempotencyKey: string }): Promise<{ ok: true; code: string; url: string } | { ok: false; reason: string }>;
  markIssued(rowId: string, code: string): Promise<boolean>;
};

export type CatchupResult =
  | { ok: true; rowId: string; code: string; url: string; already: boolean }
  | { ok: false; reason: CatchupRefusal };

export function catchupLinkKey(rowId: string): string {
  return `rentpct:${rowId}`;
}

export async function issueMissedPercent(
  input: { tenantId: string; planId: string; salesMonth: string; locale: "en" | "es" },
  deps: CatchupDeps,
): Promise<CatchupResult> {
  const gate = (deps.gate ?? rentBillingGate)();
  if (!gate.ok) return { ok: false, reason: gate.reason };
  if (!isRentPeriod(input.salesMonth)) return { ok: false, reason: "bad_period" };

  const plan = await deps.loadPlan(input.planId, input.tenantId);
  if (!plan || plan.tenantId !== input.tenantId) return { ok: false, reason: "plan_not_found" };
  if (plan.acceptedAt == null) return { ok: false, reason: "not_accepted" };
  // Only the percentage the member accepted is ever billed.
  if (plan.percentBps <= 0 || plan.acceptedPercentBps !== plan.percentBps) return { ok: false, reason: "not_a_percentage_plan" };

  const missed = await deps.loadMissedMonths(plan.id, plan.tenantId);
  if (!missed) return { ok: false, reason: "unavailable" };
  if (!missed.includes(input.salesMonth)) return { ok: false, reason: "not_missed" };

  const base = await deps.loadSalesBase({ tenantId: plan.tenantId, talentProfileId: plan.talentProfileId, period: input.salesMonth, currency: plan.currency });
  const amount = computeRentAmount({ fixedCents: 0, percentBps: plan.percentBps, salesBaseCents: base });
  if (amount == null) return { ok: false, reason: "sales_unavailable" };
  if (amount <= 0) return { ok: false, reason: "nothing_due" };

  const row = await deps.claim({ planId: plan.id, tenantId: plan.tenantId, talentProfileId: plan.talentProfileId, salesMonth: input.salesMonth, amountCents: amount, currency: plan.currency });
  if (!row) return { ok: false, reason: "unavailable" };
  if (row.status === "paid") return { ok: false, reason: "already_paid" };
  if (row.status === "void") return { ok: false, reason: "void" };

  // From here the row (not the plan) is the source of the amount.
  let orderId = row.orderId;
  if (!orderId) {
    const order = await deps.createOrder({ rowId: row.id, tenantId: plan.tenantId, currency: row.currency, label: percentLineLabel(row.salesMonth, plan.percentBps, input.locale), amountCents: row.amountCents });
    if (!order.ok) return { ok: false, reason: "unavailable" };
    if (order.needsApproval) return { ok: false, reason: "unavailable" };
    if (await deps.saveOrder(row.id, order.orderId)) {
      orderId = order.orderId;
    } else {
      const winner = await deps.readOrderId(row.id);
      if (!winner) return { ok: false, reason: "unavailable" };
      orderId = winner;
    }
  }
  const link = await deps.mintLink({ tenantId: plan.tenantId, orderId, amountCents: row.amountCents, idempotencyKey: catchupLinkKey(row.id) });
  if (!link.ok) return { ok: false, reason: "unavailable" };
  if (!(await deps.markIssued(row.id, link.code))) return { ok: false, reason: "unavailable" };
  return { ok: true, rowId: row.id, code: link.code, url: link.url, already: row.status === "issued" };
}

/** Invoice line text, in the member's language. */
export function percentLineLabel(salesMonth: string, percentBps: number, locale: "en" | "es"): string {
  const [y, m] = salesMonth.split("-").map(Number);
  const month = new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
  const pct = `${percentBps / 100}%`;
  return locale === "es" ? `Renta de estación: ${pct} de tus ventas de ${month}` : `Station rent: ${pct} of your sales, ${month}`;
}

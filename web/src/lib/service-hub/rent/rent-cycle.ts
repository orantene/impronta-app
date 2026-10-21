/**
 * TUL-1376 · Rental studio rent (pure, no DB). A studio rents a station to a member for a
 * fixed monthly amount; each month the studio issues ONE invoice by hand. This module decides
 * what may be issued and for how much. It never computes a fee: the fee is whatever the
 * existing checkout shows before the member pays.
 */
export const MAX_RENT_CENTS = 100_000_000;
/** The studio's cut of a member's sales is at most 90%: the member keeps at least 10% (same cap as the hub share). */
export const MAX_RENT_PERCENT_BPS = 9_000;

export type RentPlanStatus = "proposed" | "active" | "paused" | "ended" | "declined";

export type RentPlan = {
  id: string;
  tenantId: string;
  talentProfileId: string;
  /** The fixed part, in minor units (0 when the rent is only a percentage). */
  monthlyRentCents: number;
  /** The percentage of the member's sales in the month, in basis points (0 = fixed rent only). */
  percentBps: number;
  currency: string;
  /** YYYY-MM-DD */
  startsOn: string;
  status: RentPlanStatus;
  acceptedAt: string | null;
  /** What the member agreed to (recorded at acceptance). */
  acceptedAmountCents: number | null;
  acceptedPercentBps: number | null;
  acceptedCurrency: string | null;
  termsVersion: number;
  acceptedTermsVersion: number | null;
};

export type RentProposal = { monthlyRentCents: number; percentBps?: number; currency: string; startsOn: string };

export function validateRentProposal(p: RentProposal): { ok: true } | { ok: false; reason: "amount" | "percent" | "currency" | "starts_on" } {
  const percent = p.percentBps ?? 0;
  if (!Number.isInteger(percent) || percent < 0 || percent > MAX_RENT_PERCENT_BPS) return { ok: false, reason: "percent" };
  // A fixed amount, a percentage, or both; never nothing.
  if (!Number.isInteger(p.monthlyRentCents) || p.monthlyRentCents < 0 || p.monthlyRentCents > MAX_RENT_CENTS || (p.monthlyRentCents === 0 && percent === 0)) {
    return { ok: false, reason: "amount" };
  }
  if (!/^[A-Z]{3}$/.test(p.currency)) return { ok: false, reason: "currency" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.startsOn) || Number.isNaN(Date.parse(`${p.startsOn}T00:00:00Z`))) {
    return { ok: false, reason: "starts_on" };
  }
  return { ok: true };
}

export function isRentPeriod(period: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(period);
}

/** Rent months are Mexico City months (the studios' clock; Mexico has no DST since 2022). */
export const RENT_TZ = "America/Mexico_City";

function tzParts(utcMs: number, tz: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: g("year"), mo: g("month"), d: g("day"), h: g("hour") % 24, mi: g("minute"), s: g("second") };
}

/** The rent month a moment falls in, on the Mexico City clock. */
export function currentRentPeriod(now: Date, tz: string = RENT_TZ): string {
  const p = tzParts(now.getTime(), tz);
  return `${p.y}-${String(p.mo).padStart(2, "0")}`;
}

/** The month after "YYYY-MM". */
export function nextRentPeriodOf(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** The UTC instant a rent month starts: local midnight of its first day. */
export function zonedMonthStartUtc(period: string, tz: string = RENT_TZ): Date {
  const [y, m] = period.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, 1);
  let guess = wall;
  for (let i = 0; i < 3; i += 1) {
    const p = tzParts(guess, tz);
    const shown = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
    guess += wall - shown;
  }
  return new Date(guess);
}

export type RentIssueRefusal =
  | "month_not_closed"
  | "sales_unavailable"
  | "nothing_due"
  | "bad_period"
  | "not_accepted"
  | "not_active"
  | "before_start"
  | "future_period"
  | "bad_amount";

/**
 * Fixed part + the studio's percentage of the member's sales base (half-up to the cent). null when a percentage
 * is owed but the base is not a usable whole number: fail closed, never guess a base.
 */
export function computeRentAmount(input: { fixedCents: number; percentBps: number; salesBaseCents: number | null }): number | null {
  if (input.percentBps === 0) return input.fixedCents;
  const base = input.salesBaseCents;
  if (base == null || !Number.isInteger(base) || base < 0) return null;
  return input.fixedCents + Math.floor((base * input.percentBps + 5_000) / 10_000);
}

/**
 * May this plan be invoiced for this month, and for how much? The amount is always the plan's
 * own rent: nothing a caller sends can change it. Only an ACCEPTED, active plan is billed
 * (the member agreed to be charged), never a month before the plan starts, never a month that
 * has not begun yet.
 */
export function decideRentIssue(input: {
  plan: RentPlan;
  period: string;
  now: Date;
  /** The member's sales in the month (needed only when the plan has a percentage). */
  salesBaseCents?: number | null;
}): { ok: true; amountCents: number; currency: string } | { ok: false; reason: RentIssueRefusal } {
  const { plan, period, now } = input;
  if (!isRentPeriod(period)) return { ok: false, reason: "bad_period" };
  if (plan.acceptedAt == null) return { ok: false, reason: "not_accepted" };
  if (plan.status !== "active") return { ok: false, reason: "not_active" };
  if (!validateRentProposal({ monthlyRentCents: plan.monthlyRentCents, percentBps: plan.percentBps, currency: plan.currency, startsOn: plan.startsOn }).ok) {
    return { ok: false, reason: "bad_amount" };
  }
  if (period < plan.startsOn.slice(0, 7)) return { ok: false, reason: "before_start" };
  if (period > currentRentPeriod(now)) return { ok: false, reason: "future_period" };
  // A percentage of sales is billed once the month is over, so the sales it is a share of are final.
  if (plan.percentBps > 0 && period >= currentRentPeriod(now)) return { ok: false, reason: "month_not_closed" };
  const amount = computeRentAmount({ fixedCents: plan.monthlyRentCents, percentBps: plan.percentBps, salesBaseCents: input.salesBaseCents ?? null });
  if (amount == null) return { ok: false, reason: "sales_unavailable" };
  if (amount <= 0) return { ok: false, reason: "nothing_due" };
  return { ok: true, amountCents: amount, currency: plan.currency };
}

/** Invoice line text, in the member's language. */
export function rentLineLabel(period: string, locale: "en" | "es"): string {
  const [y, m] = period.split("-").map(Number);
  const month = new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
  return locale === "es" ? `Renta de estación, ${month}` : `Station rent, ${month}`;
}

/**
 * An invoice that is exactly what the member accepted (same terms version, amount and currency)
 * needs no manager approval for the custom-amount limit: the member's consent is the approval.
 * Anything else (an edited plan, a missing record) still goes through the normal approval.
 */
export function matchesAcceptedTerms(plan: RentPlan, invoice: { amountCents: number; currency: string }): boolean {
  // A percentage plan's amount varies by month, so what must match is the TERMS she accepted (fixed part,
  // percentage, currency, version). A fixed-only plan must also match the invoice amount exactly.
  const amountMatches = plan.percentBps > 0
    ? plan.acceptedAmountCents === plan.monthlyRentCents && plan.acceptedPercentBps === plan.percentBps
    : plan.acceptedAmountCents === invoice.amountCents && (plan.acceptedPercentBps ?? 0) === 0;
  return (
    plan.acceptedAt != null &&
    amountMatches &&
    plan.acceptedCurrency === invoice.currency &&
    plan.acceptedTermsVersion != null &&
    plan.acceptedTermsVersion === plan.termsVersion
  );
}

export type RentLinkState = "none" | "waiting" | "paid" | "needs_new_link";

/** What the owner sees for one month's invoice. A dead link (expired, cancelled, failed) asks for a new one. */
export function rentLinkState(invoiceStatus: string, linkStatus: string | null): RentLinkState {
  if (invoiceStatus === "paid" || linkStatus === "paid") return "paid";
  if (invoiceStatus === "void") return "none";
  if (invoiceStatus === "failed") return "needs_new_link";
  if (invoiceStatus === "issuing") return "needs_new_link";
  if (linkStatus === "open") return "waiting";
  if (linkStatus == null) return "none";
  return "needs_new_link";
}

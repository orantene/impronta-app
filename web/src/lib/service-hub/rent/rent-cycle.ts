/**
 * TUL-1376 · Rental studio rent (pure, no DB). A studio rents a station to a member for a
 * fixed monthly amount; each month the studio issues ONE invoice by hand. This module decides
 * what may be issued and for how much. It never computes a fee: the fee is whatever the
 * existing checkout shows before the member pays.
 */
export const MAX_RENT_CENTS = 100_000_000;

export type RentPlanStatus = "proposed" | "active" | "paused" | "ended" | "declined";

export type RentPlan = {
  id: string;
  tenantId: string;
  talentProfileId: string;
  monthlyRentCents: number;
  currency: string;
  /** YYYY-MM-DD */
  startsOn: string;
  status: RentPlanStatus;
  acceptedAt: string | null;
};

export type RentProposal = { monthlyRentCents: number; currency: string; startsOn: string };

export function validateRentProposal(p: RentProposal): { ok: true } | { ok: false; reason: "amount" | "currency" | "starts_on" } {
  if (!Number.isInteger(p.monthlyRentCents) || p.monthlyRentCents <= 0 || p.monthlyRentCents > MAX_RENT_CENTS) {
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

/** The rent month a date falls in, in UTC (the same clock the database uses). */
export function currentRentPeriod(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type RentIssueRefusal =
  | "bad_period"
  | "not_accepted"
  | "not_active"
  | "before_start"
  | "future_period"
  | "bad_amount";

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
}): { ok: true; amountCents: number; currency: string } | { ok: false; reason: RentIssueRefusal } {
  const { plan, period, now } = input;
  if (!isRentPeriod(period)) return { ok: false, reason: "bad_period" };
  if (plan.acceptedAt == null) return { ok: false, reason: "not_accepted" };
  if (plan.status !== "active") return { ok: false, reason: "not_active" };
  if (!validateRentProposal({ monthlyRentCents: plan.monthlyRentCents, currency: plan.currency, startsOn: plan.startsOn }).ok) {
    return { ok: false, reason: "bad_amount" };
  }
  if (period < plan.startsOn.slice(0, 7)) return { ok: false, reason: "before_start" };
  if (period > currentRentPeriod(now)) return { ok: false, reason: "future_period" };
  return { ok: true, amountCents: plan.monthlyRentCents, currency: plan.currency };
}

/** Invoice line text, in the member's language. */
export function rentLineLabel(period: string, locale: "en" | "es"): string {
  const [y, m] = period.split("-").map(Number);
  const month = new Intl.DateTimeFormat(locale === "es" ? "es-MX" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
  return locale === "es" ? `Renta de estación, ${month}` : `Station rent, ${month}`;
}

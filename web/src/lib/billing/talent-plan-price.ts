/**
 * Talent plan prices are billed in USD. Every surface prints them through the
 * shared dashboard formatter so the currency code is always explicit
 * ("$15 USD"), never a bare "$", even on an MXN account (TUL-988).
 *
 * Display only. Pure module, no React.
 */
import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";

export const TALENT_PLAN_BILLING_CURRENCY = "USD";

/** "$15 USD" (en) for a catalog price in USD cents. */
export function formatTalentPlanPrice(cents: number, locale: string = "en"): string {
  return formatDashboardMoneyCents(cents, TALENT_PLAN_BILLING_CURRENCY, locale);
}

export type TalentPlanInterval = "month" | "year";

/**
 * TUL-1297: the price line for a talent plan at its billing interval. A yearly
 * plan prints the yearly amount ("$150 USD / year") with the monthly
 * equivalent as secondary text, never the monthly price under a yearly plan.
 */
export function talentPlanPriceLine(input: {
  monthlyCents: number;
  annualCents: number | null;
  interval: TalentPlanInterval;
  locale?: string;
}): { primary: string; secondary: string | null } {
  const es = (input.locale ?? "en").toLowerCase().startsWith("es");
  const locale = es ? "es" : "en";
  const yearly = input.interval === "year" && typeof input.annualCents === "number" && input.annualCents > 0;
  if (!yearly) {
    return { primary: `${formatTalentPlanPrice(input.monthlyCents, locale)} ${es ? "/ mes" : "/ month"}`, secondary: null };
  }
  const annual = input.annualCents as number;
  const perMonth = formatTalentPlanPrice(Math.round(annual / 12), locale);
  return {
    primary: `${formatTalentPlanPrice(annual, locale)} ${es ? "/ año" : "/ year"}`,
    secondary: es ? `Equivale a ${perMonth} al mes` : `About ${perMonth} a month`,
  };
}

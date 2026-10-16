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

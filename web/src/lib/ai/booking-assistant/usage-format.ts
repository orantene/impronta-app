/**
 * TUL-320 follow-up: read-only usage display strings for the booking assistant.
 * Pure, so the talent settings line and the platform admin table share one
 * formatter. Amounts are US dollars (the cap is stored in cents).
 */
import { bookingAssistantMonthlyCapCents } from "./credits";
import { bookingAssistantRemainingCents } from "./spend";

export type BookingAssistantUsage = {
  usedCents: number;
  capCents: number;
  remainingCents: number;
  /** 0 to 100, rounded; 100 when the cap is reached. */
  percentUsed: number;
};

function cleanCents(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** "$1.20" for 120 cents; amounts are always USD. */
export function formatAssistantCents(cents: number): string {
  return `$${(cleanCents(cents) / 100).toFixed(2)}`;
}

export function bookingAssistantUsage(
  usedCents: number,
  planKey: string | null | undefined,
): BookingAssistantUsage {
  const used = cleanCents(usedCents);
  const cap = bookingAssistantMonthlyCapCents(planKey);
  const percent = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  return {
    usedCents: used,
    capCents: cap,
    remainingCents: bookingAssistantRemainingCents(used, planKey),
    percentUsed: percent,
  };
}

/** One line for the talent settings: "Used this month: $1.20 of $5.00". */
export function bookingAssistantUsageLine(usage: BookingAssistantUsage, locale: "en" | "es"): string {
  const used = formatAssistantCents(usage.usedCents);
  const cap = formatAssistantCents(usage.capCents);
  return locale === "es" ? `Usado este mes: ${used} de ${cap}` : `Used this month: ${used} of ${cap}`;
}

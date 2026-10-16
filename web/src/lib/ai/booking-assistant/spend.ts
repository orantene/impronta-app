/**
 * Booking-assistant spend helpers for the usage panels (ported from closed #3746).
 * Kept apart from credits.ts, which the money PR owns; pure, read-only math.
 */
import { bookingAssistantMonthlyCapCents } from "./credits";

/** First instant of the current UTC month, the reset boundary for the cap. */
export function utcMonthStartIso(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00.000Z`;
}

/** Cents spent from usage-log rows; each paid row counts at least 1 cent. */
export function sumBookingAssistantSpendCents(
  rows: ReadonlyArray<{ context_jsonb?: { cost_usd?: unknown } | null }>,
): number {
  let cents = 0;
  for (const row of rows) {
    const usd = row.context_jsonb?.cost_usd;
    if (typeof usd === "number" && Number.isFinite(usd) && usd > 0) {
      cents += Math.max(1, Math.round(usd * 100));
    }
  }
  return cents;
}

/** Cents left this month, never negative (for usage display). */
export function bookingAssistantRemainingCents(
  usedCentsThisMonth: number,
  planKey: string | null | undefined,
): number {
  const used = Number.isFinite(usedCentsThisMonth) ? Math.max(0, Math.floor(usedCentsThisMonth)) : 0;
  return Math.max(0, bookingAssistantMonthlyCapCents(planKey) - used);
}

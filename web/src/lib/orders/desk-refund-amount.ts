/**
 * Parse the Orders desk refund amount field into minor units.
 *
 * The field shows major units (300 for MX$300) and defaults to the full
 * remaining of the picked lines. Blank / whitespace means "full remaining".
 * Over-ask and non-positive refuse — the planner also refuses, but the form
 * needs a code before it posts so the cashier sees the sentence next to the
 * field rather than after a round trip.
 */

import { minorUnitDivisor } from "@/lib/orders/money-format";

export type DeskRefundAmountParse =
  | { ok: true; cents: number; capped: boolean }
  | { ok: false; reason: "invalid" | "exceeds" | "empty_partial" };

/**
 * @param majorText - what the cashier typed (major units), or "" for full
 * @param currency - ISO code; drives the minor-unit divisor
 * @param maxCents - remaining refundable on the picked lines
 */
export function parseDeskRefundAmount(
  majorText: string,
  currency: string,
  maxCents: number,
): DeskRefundAmountParse {
  const max = Math.max(0, Math.trunc(maxCents));
  const raw = majorText.replace(/,/g, "").trim();
  if (raw === "") {
    if (max <= 0) return { ok: false, reason: "empty_partial" };
    return { ok: true, cents: max, capped: false };
  }
  const major = Number(raw);
  if (!Number.isFinite(major) || major <= 0) return { ok: false, reason: "invalid" };
  const divisor = minorUnitDivisor(currency);
  const cents = Math.round(major * divisor);
  if (!Number.isInteger(cents) || cents <= 0) return { ok: false, reason: "invalid" };
  if (cents > max) return { ok: false, reason: "exceeds" };
  return { ok: true, cents, capped: cents < max };
}

/** Major-unit string for the default (full remaining) amount field. */
export function deskRefundAmountDefault(maxCents: number, currency: string): string {
  const max = Math.max(0, Math.trunc(maxCents));
  const divisor = minorUnitDivisor(currency);
  if (divisor === 1) return String(max);
  const whole = Math.floor(max / divisor);
  const frac = String(max % divisor).padStart(2, "0");
  return frac === "00" ? String(whole) : `${whole}.${frac}`;
}

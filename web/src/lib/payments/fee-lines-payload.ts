/**
 * Client fee lines carried on a payment-request card payload (and reused by
 * the confirmation PDF). Pure and client-safe: it only VALIDATES lines the
 * server already computed from the booking's frozen commission snapshot
 * (see `loadPayLinkFeeLines`). Same rule as the pay link: the lines must sum
 * exactly to the charged amount, otherwise there is no breakdown at all.
 */

import type { FeeLine, FeeLineCode } from "@/lib/billing/processing-fee-payer";

const CLIENT_CODES: ReadonlySet<FeeLineCode> = new Set<FeeLineCode>([
  "service_subtotal",
  "base_reservation_fee",
  "platform_fee",
  "processing_fee",
  "total_charged",
]);

/**
 * Returns the lines when they are well formed, end with `total_charged`, the
 * parts add up to it, and it equals `chargeCents`; otherwise []. Never a guess.
 */
export function validClientFeeLines(raw: unknown, chargeCents: number | null): FeeLine[] {
  if (!Array.isArray(raw) || raw.length < 2 || chargeCents == null) return [];
  const lines: FeeLine[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") return [];
    const { code, cents } = r as { code?: unknown; cents?: unknown };
    if (typeof code !== "string" || !CLIENT_CODES.has(code as FeeLineCode)) return [];
    if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 0) return [];
    lines.push({ code: code as FeeLineCode, cents });
  }
  const last = lines[lines.length - 1];
  if (last.code !== "total_charged" || last.cents !== chargeCents) return [];
  const seen = new Set<FeeLineCode>();
  let parts = 0;
  for (const l of lines.slice(0, -1)) {
    if (l.code === "total_charged" || seen.has(l.code)) return [];
    seen.add(l.code);
    parts += l.cents;
  }
  return parts === chargeCents ? lines : [];
}

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

/** Non-additive memo that may follow the total (flag-gated, TUL-1061). */
const MEMO_CODE: FeeLineCode = "card_fee_memo";

/**
 * Returns the lines when they are well formed, end with `total_charged`, the
 * parts add up to it, and it equals `chargeCents`; otherwise []. Never a guess.
 * A trailing `card_fee_memo` is dropped unless `keepMemo` (receipts, PDFs and
 * notifications keep today's lines).
 */
export function validClientFeeLines(
  raw: unknown,
  chargeCents: number | null,
  opts?: { keepMemo?: boolean },
): FeeLine[] {
  if (!Array.isArray(raw) || raw.length < 2 || chargeCents == null) return [];
  const lines: FeeLine[] = [];
  let memo: FeeLine | null = null;
  for (let idx = 0; idx < raw.length; idx += 1) {
    const r = raw[idx];
    if (r && typeof r === "object" && (r as { code?: unknown }).code === MEMO_CODE) {
      const cents = (r as { cents?: unknown }).cents;
      if (idx !== raw.length - 1 || memo || typeof cents !== "number" || !Number.isInteger(cents) || cents <= 0) return [];
      memo = { code: MEMO_CODE, cents };
      continue;
    }
    if (!r || typeof r !== "object") return [];
    const { code, cents } = r as { code?: unknown; cents?: unknown };
    if (typeof code !== "string" || !CLIENT_CODES.has(code as FeeLineCode)) return [];
    if (typeof cents !== "number" || !Number.isInteger(cents) || cents < 0) return [];
    lines.push({ code: code as FeeLineCode, cents });
  }
  const last = lines[lines.length - 1];
  if (!last || last.code !== "total_charged" || last.cents !== chargeCents) return [];
  const seen = new Set<FeeLineCode>();
  let parts = 0;
  for (const l of lines.slice(0, -1)) {
    if (l.code === "total_charged" || seen.has(l.code)) return [];
    seen.add(l.code);
    parts += l.cents;
  }
  if (parts !== chargeCents) return [];
  return memo && opts?.keepMemo ? [...lines, memo] : lines;
}

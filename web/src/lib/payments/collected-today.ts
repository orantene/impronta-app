/**
 * "Collected today" tile of the Payments board, as a pure function (moved verbatim out of
 * `_data-bridge/payments-board.ts` so it can be tested on fixed fixtures; TUL-734).
 *
 * Amounts are summed exactly as before. The ONLY input that decides a label is `fallbackCurrency`,
 * used when there are no takings today; it never changes a cent.
 */
import type { TakingsByMethod } from "./activity-shape";

export type CollectedToday = {
  ok: true;
  currency: string;
  totalCents: number;
  cashCents: number;
  cardCents: number;
  otherCents: number;
};

export function isCardMethod(method: string): boolean {
  return method === "card_manual" || method.startsWith("stripe") || method.startsWith("mercado");
}

export function summarizeCollectedToday(byMethod: readonly TakingsByMethod[], fallbackCurrency: string): CollectedToday {
  const currency = byMethod[0]?.currency ?? fallbackCurrency;
  let cash = 0;
  let card = 0;
  let other = 0;
  for (const m of byMethod) {
    if (m.currency !== currency) continue;
    if (m.method === "cash") cash += m.totalCents;
    else if (isCardMethod(m.method)) card += m.totalCents;
    else other += m.totalCents;
  }
  return { ok: true, currency, totalCents: cash + card + other, cashCents: cash, cardCents: card, otherCents: other };
}

/**
 * TUL-715: the talent side panel read only `source_channel = "messages"`
 * orders, so a booking made through instant book (the QA failed-payment
 * case) showed "no items, no charges". Prefer the conversation's own
 * messages order, else the newest order on the inquiry. Pure.
 */
export function pickSaleOrder<T extends { source_channel: string | null; created_at: string }>(
  rows: readonly T[],
): T | null {
  const newest = (list: readonly T[]) =>
    [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
  return newest(rows.filter((r) => r.source_channel === "messages")) ?? newest(rows);
}

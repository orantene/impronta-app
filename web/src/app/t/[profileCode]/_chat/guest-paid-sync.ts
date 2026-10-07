/**
 * TUL-11 A: the dock shows Paid only from server truth.
 *
 * The webhook settles the payment and posts a `payment_paid` card; nothing on
 * the client may flip to Paid before that row exists. The incremental poll
 * only merges new rows, so the v5 slice (items shelf pay chips, receipt) went
 * stale after a payment. A settled-money row in a poll means: reload the thread.
 */

const SETTLEMENT_KINDS: ReadonlySet<string> = new Set([
  "payment_paid",
  "balance_due",
  "booking_confirmed",
]);

/** PURE: true when freshly polled rows say money settled (or state moved) server-side. */
export function pollNeedsFullReload(incoming: readonly { kind?: string | null; payload?: Record<string, unknown> | null }[]): boolean {
  return incoming.some((m) => (m.kind ? SETTLEMENT_KINDS.has(m.kind) : false) || m.payload?.state === "paid");
}

/** PURE: the only status the dock may call "paid" is one the server wrote. */
export function isServerPaid(messages: readonly { kind?: string | null }[]): boolean {
  return messages.some((m) => m.kind === "payment_paid");
}

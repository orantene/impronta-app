/**
 * The ONE place `/r/<code>` decides whether `receipt_for_code` gave it a
 * receipt. Pure, so the shapes that crashed a guest can be pinned:
 *
 *   - `[]`        SETOF with zero rows (…806): "no such code"
 *   - `[null]`    a set of one NULL row
 *   - `null`      scalar jsonb NULL (…805 era)
 *   - `[{…}]`     SETOF with one row (PostgREST hands back an array)
 *   - `{…}`       scalar jsonb object
 *
 * On 2026-09-05 22:56Z the page read the set as a scalar: `[]` is truthy,
 * `[].order` is undefined, `.tenantId` threw, and a guest holding a printed
 * code got a 500 (Vercel digest 3864621087). Anything without an `order`
 * object is NOT a receipt and the page must refuse, never throw.
 */

export type ReceiptLike = { order: { tenantId: string } & Record<string, unknown> } & Record<string, unknown>;

export function pickReceipt(raw: unknown): ReceiptLike | null {
  const one: unknown = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  if (!one || typeof one !== "object") return null;
  const order = (one as { order?: unknown }).order;
  if (!order || typeof order !== "object") return null;
  if (typeof (order as { tenantId?: unknown }).tenantId !== "string") return null;
  return one as ReceiptLike;
}

/** A receipt from another tenant on this host is exactly an unknown code. */
export function receiptBelongsTo(receipt: ReceiptLike, tenantId: string): boolean {
  return receipt.order.tenantId === tenantId;
}

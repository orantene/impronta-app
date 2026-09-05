/**
 * offering-stock.ts — release reserved product stock when a storefront booking
 * ends without fulfillment (human cancel or free-reserve expiry).
 *
 * The instant-book engine decrements one unit of a product offering's
 * `inventory_qty` at reserve time and stamps `stock_reserved: true` onto the
 * inquiry's `source_context.offering`. Only THAT flag causes a release here, so
 * a request-mode product booking (which never reserved) can't be over-released,
 * and a double cancel can't double-release (the caller's status-transition guard
 * runs the release at most once per booking).
 *
 * Uses the service-role client so the SECURITY DEFINER `release_offering_stock`
 * RPC runs regardless of the caller's session/RLS. Best-effort: a failure is
 * logged and swallowed so it never blocks the cancel it accompanies.
 */


type OfferingContext = {
  offering_id?: string;
  kind?: string;
  stock_reserved?: boolean;
  /** D5 — units reserved at booking time (absent/0 on pre-D5 rows ⇒ 1). */
  stock_reserved_qty?: number;
};

/** Read the offering stamp an inquiry carries (null when there is none). */
export function readInquiryOfferingContext(sourceContext: unknown): OfferingContext | null {
  if (!sourceContext || typeof sourceContext !== "object") return null;
  const off = (sourceContext as { offering?: unknown }).offering;
  if (!off || typeof off !== "object") return null;
  return off as OfferingContext;
}

/**
 * True only when this inquiry reserved units that should be released.
 *
 * The `kind === "product"` test that used to be here is GONE (capacity 0.3b).
 * It was the mirror image of the reserve gate: a seat-limited package could
 * have its units taken and never given back. In practice neither half ever ran
 * for a package, so the seats were never taken either — the bug was an
 * unbounded oversell, not a stuck seat. The stamp is now the whole test: if the
 * engine recorded that it reserved, we release, whatever the offering is.
 */
export function shouldReleaseStock(ctx: OfferingContext | null): ctx is OfferingContext & { offering_id: string } {
  return Boolean(ctx && ctx.stock_reserved === true && ctx.offering_id);
}

/**
 * Release the product units an inquiry reserved, if any. No-op when the
 * inquiry carries no reserved-product stamp. Returns whether a release ran.
 *
 * IDEMPOTENT across callers: after a successful release the inquiry's
 * `stock_reserved` flag is flipped false, so a second path hitting the same
 * inquiry (e.g. staff cancel followed by a refund) can never double-restock.
 */

/**
 * `releaseReservedOfferingStock` was REMOVED here (0.6b-3).
 *
 * It was the last caller of the `release_offering_stock` RPC, which frees a
 * QUANTITY newest-first and so can release a different allocation than the one
 * the caller reserved. Capacity is dropping that RPC and its reserve twin; this
 * removal is what unblocks them.
 *
 * Safe because the path was UNREACHABLE, not merely unused, and each leg was
 * checked rather than assumed:
 *   - both engines that wrote `source_context.offering.stock_reserved` are
 *     deleted, and no code writes that stamp (grep: comments only);
 *   - production carries zero stamped inquiries, and zero offerings with
 *     `inventory_qty` set but no `capacity_pool_id` — the second is Capacity's
 *     check, and it is the one whose failure mode is a live oversell rather
 *     than a stranded row.
 *
 * The pure half stays: `readInquiryOfferingContext` still has three callers and
 * touches no RPC. Retiring the RPC and retiring this module were never the same
 * job, and conflating them would have deleted a parser nobody asked to remove.
 */

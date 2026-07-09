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

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

type OfferingContext = {
  offering_id?: string;
  kind?: string;
  stock_reserved?: boolean;
};

/** Read the offering stamp an inquiry carries (null when there is none). */
export function readInquiryOfferingContext(sourceContext: unknown): OfferingContext | null {
  if (!sourceContext || typeof sourceContext !== "object") return null;
  const off = (sourceContext as { offering?: unknown }).offering;
  if (!off || typeof off !== "object") return null;
  return off as OfferingContext;
}

/** True only when this inquiry reserved a product unit that should be released. */
export function shouldReleaseStock(ctx: OfferingContext | null): ctx is OfferingContext & { offering_id: string } {
  return Boolean(ctx && ctx.stock_reserved === true && ctx.kind === "product" && ctx.offering_id);
}

/**
 * Release the single product unit an inquiry reserved, if any. No-op when the
 * inquiry carries no reserved-product stamp. Returns whether a release ran.
 */
export async function releaseReservedOfferingStock(
  inquiryId: string,
  adminClient?: SupabaseClient,
): Promise<boolean> {
  const admin = (adminClient ?? createServiceRoleClient()) as SupabaseClient | null;
  if (!admin) return false;
  try {
    const { data: inq, error } = await admin
      .from("inquiries")
      .select("source_context")
      .eq("id", inquiryId)
      .maybeSingle();
    if (error || !inq) {
      if (error) logServerError("offering-stock/lookup", error);
      return false;
    }
    const ctx = readInquiryOfferingContext((inq as { source_context?: unknown }).source_context);
    if (!shouldReleaseStock(ctx)) return false;
    const { error: rpcErr } = await admin.rpc("release_offering_stock", {
      p_offering_id: ctx.offering_id,
      p_qty: 1,
    });
    if (rpcErr) {
      logServerError("offering-stock/release", rpcErr);
      return false;
    }
    return true;
  } catch (err) {
    logServerError("offering-stock/release", err);
    return false;
  }
}

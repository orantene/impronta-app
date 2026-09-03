/**
 * offering-stock-admin.ts — the ONE way an editor changes an offering's stock.
 *
 * A stock edit is not a number write. An owner typing "20" means "twenty
 * AVAILABLE NOW", so the pool's total has to become 20 plus whatever is already
 * held by live orders. Writing 20 into the total would shrink the ceiling below
 * what is outstanding; writing 20 into the mirror alone would desync it from the
 * pool, and the storefront reads the mirror.
 *
 * `set_offering_stock` does that arithmetic under the pool's row lock, so a
 * purchase landing mid-edit cannot be erased. Reducing below what is held is
 * allowed and never cancels a hold: availability goes to 0 and the existing
 * buyers keep their seats. Taking a seat back from someone who paid is a refund
 * decision, not a side effect of an editor field.
 *
 * Every writer of offering stock goes through here. Do not UPDATE
 * talent_offerings.inventory_qty directly.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export type SetOfferingStockResult =
  | {
      ok: true;
      /** null when the offering is now unlimited. */
      poolId: string | null;
      /** Units a buyer can take right now. null = unlimited. */
      available: number | null;
      /** Units already committed or held by live orders. */
      held: number;
      /** available + held. null = unlimited. */
      unitsTotal: number | null;
    }
  | { ok: false; reason: "offering_not_found" | "negative_stock" | "unavailable" };

type Rpc = Pick<SupabaseClient, "rpc">;

/**
 * Set an offering's AVAILABLE stock. Pass null for unlimited.
 *
 * Going unlimited deactivates the pool rather than deleting it, so the record of
 * what was sold while the offering was limited survives.
 */
export async function setOfferingStock(
  offeringId: string,
  available: number | null,
  admin?: Rpc,
): Promise<SetOfferingStockResult> {
  const db = (admin ?? createServiceRoleClient()) as Rpc | null;
  if (!db) return { ok: false, reason: "unavailable" };

  const normalised =
    available == null ? null : Math.max(0, Math.round(available));

  const { data, error } = await db.rpc("set_offering_stock", {
    p_offering_id: offeringId,
    p_available: normalised,
  });
  if (error) {
    logServerError("capacity/set-offering-stock", error);
    return { ok: false, reason: "unavailable" };
  }

  const r = data as Record<string, unknown> | null;
  if (r?.ok === true) {
    return {
      ok: true,
      poolId: (r.pool_id as string | null) ?? null,
      available: r.available == null ? null : Number(r.available),
      held: Number(r.held ?? 0),
      unitsTotal: r.units_total == null ? null : Number(r.units_total),
    };
  }
  return {
    ok: false,
    reason: (r?.reason as "offering_not_found" | "negative_stock") ?? "unavailable",
  };
}

/**
 * True when a saved offering's stock differs from what the editor submitted, so
 * a caller can skip the RPC on saves that did not touch stock. Compares the
 * MIRROR, which is what the editor renders.
 */
export function stockChanged(
  savedInventoryQty: number | null | undefined,
  submitted: number | null | undefined,
): boolean {
  const a = savedInventoryQty == null ? null : Math.round(savedInventoryQty);
  const b = submitted == null ? null : Math.round(submitted);
  return a !== b;
}

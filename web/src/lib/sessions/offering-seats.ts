import "server-only";

/**
 * offering-seats.ts — reading a cohort's remaining seats for a public page.
 *
 * ONE ROUND TRIP PER POOL, and the authority is the database.
 *
 * `capacity_remaining_public` is the designed reader for exactly this: its own
 * comment in the engine migration says a storefront has to be able to say
 * "3 left" without a round trip through a server action, it returns ONE INTEGER
 * and never a row, and it is the only capacity function granted to `anon`. It
 * also walks the whole ancestor chain, so a cohort under a room that is booked
 * out reports the room's answer rather than its own.
 *
 * NOT `capacity_pool_committed_peak`. That function is the shrink FLOOR — the
 * number `units_total` must not be set below — and it is explicitly
 * `REVOKE ALL ... FROM PUBLIC, anon, authenticated`, service_role only. For an
 * unwindowed cohort the two agree, because peak's base branch sums exactly the
 * allocations remaining subtracts. They stop agreeing the moment the pool
 * carries windowed allocations, where the peak is the busiest single window and
 * remaining is what is free in the window you asked about. A page asking "how
 * many seats can I still buy" wants the second.
 */

import { logServerError } from "@/lib/server/safe-error";
import type { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Derived, never restated. A hand-written `SupabaseClient<never, never, never>`
 * typechecked in its own file and collapsed every row to `never` at the CALL
 * sites in #1780. This cannot drift from what the callers actually hold.
 */
type Admin = NonNullable<ReturnType<typeof createServiceRoleClient>>;

export type OfferingSeats = { remaining: number | null; total: number | null };

/**
 * Remaining and total seats for each offering that has a cohort pool.
 *
 * Offerings with no pool are simply absent from the result, which the caller
 * renders as no badge. A read failure is also absent rather than zero: a page
 * that says "Sold out" because a query failed refuses a sale nobody will report.
 */
export async function loadOfferingSeats(
  admin: Admin,
  tenantId: string,
  offeringIds: readonly string[],
): Promise<Map<string, OfferingSeats>> {
  const out = new Map<string, OfferingSeats>();
  if (offeringIds.length === 0) return out;

  const { data: pools, error } = await admin
    .from("capacity_pools")
    .select("id, subject_id, units_total, is_active")
    .eq("tenant_id", tenantId)
    .eq("subject_kind", "offering")
    .eq("pool_key", "default")
    .in("subject_id", offeringIds as string[]);
  if (error) {
    logServerError("sessions.loadOfferingSeats.pools", error);
    return out;
  }

  for (const pool of pools ?? []) {
    if (pool.is_active === false) continue;
    // The window arguments are OMITTED, not passed as null. Their generated
    // type is `p_starts_at?: string` — optional, not nullable — so `null` is a
    // type error, and the SQL defaults both to NULL anyway. Omitting says the
    // same thing to the database and the truthful thing to the compiler.
    //
    // A null window is what a cohort wants: its allocations are unwindowed, and
    // a null query window is overlapped by every allocation, which is the
    // whole-course answer rather than one night's.
    const { data: remaining, error: remError } = await admin.rpc("capacity_remaining_public", {
      p_pool_id: String(pool.id),
    });
    if (remError) {
      logServerError("sessions.loadOfferingSeats.remaining", remError);
      continue;
    }
    out.set(String(pool.subject_id), {
      remaining: typeof remaining === "number" ? remaining : null,
      total: typeof pool.units_total === "number" ? pool.units_total : null,
    });
  }

  return out;
}

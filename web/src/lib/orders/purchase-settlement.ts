import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { commitCapacity } from "@/lib/capacity";
import { settlesOnCreation } from "@/lib/orders/settles-on-creation";

/**
 * What an order looks like the moment after its payment leg is opened.
 *
 * Two fields, and they are not independent. `status: "paid"` with a
 * `hold_expires_at` is a settled order carrying a deadline, and
 * `decideOrderExpiry` reads a lapsed deadline as permission to cancel. So they
 * are produced together, once, from one decision — which is the whole reason
 * this left `createPurchase`, where the status and the deadline were computed
 * by two separate copies of the same condition and drifted apart.
 */
export type SettlementPatch = {
  readonly status: "paid" | "pending_payment";
  readonly hold_expires_at: string | null;
};

export type SettlementResult =
  | { readonly ok: true; readonly patch: SettlementPatch; readonly settled: boolean }
  | {
      readonly ok: false;
      /** `sold_out` when somebody else may hold these units; otherwise the engine failed to answer. */
      readonly reason: "sold_out" | "capacity_unavailable";
      /** What to unwind with, so the caller's compensation log says why. */
      readonly note: string;
    };

/**
 * Settle the order, or leave it holding under a deadline.
 *
 * COMMITS BEFORE IT REPORTS, and refuses if the commit fails. A settled order
 * whose capacity is still a `hold` loses that capacity when the hold lapses:
 * `remaining()` counts a hold only `WHERE expires_at > now()`, and
 * `reap_capacity_allocations` releases it — so the guest keeps a confirmation
 * for a table the venue has already resold. Nothing has been charged on this
 * path, so refusing is honest and cheap, unlike `completeOrderForTransaction`,
 * which cannot refuse because money has moved and alerts a human instead.
 */
export async function settleOrHoldOrder(
  admin: Pick<SupabaseClient, "rpc">,
  input: {
    readonly payInPerson: boolean;
    readonly collectCents: number;
    readonly totalCents: number;
    readonly heldAllocationIds: readonly string[];
    readonly holdTtlSeconds: number;
  },
): Promise<SettlementResult> {
  const settled = settlesOnCreation({
    payInPerson: input.payInPerson,
    collectCents: input.collectCents,
    totalCents: input.totalCents,
  });

  if (settled && input.heldAllocationIds.length > 0) {
    // `null` order line on purpose: the allocations were reserved against
    // their lines already, and `commit_capacity` treats the argument as a line
    // to STAMP, not an actor.
    const committed = await commitCapacity([...input.heldAllocationIds], null, admin);
    if (!committed.ok) {
      return {
        ok: false,
        // `expired` means somebody else may already hold these units, which is
        // sold out. `missing` / `released` is the engine failing to answer, and
        // telling a guest a restaurant is full during an outage is the same
        // mistake as reading an unknown as a free table.
        reason: committed.reason === "expired" ? "sold_out" : "capacity_unavailable",
        note: `capacity could not be committed for a settled order: ${committed.reason}`,
      };
    }
  }

  return {
    ok: true,
    settled,
    patch: {
      status: settled ? "paid" : "pending_payment",
      // The SHORTEST hold across the lines: the order expires when its first
      // allocation does, because anything later would leave the order claiming
      // a hold it no longer has. A settled order has no deadline at all —
      // there is nothing it is waiting for.
      hold_expires_at:
        !settled && input.heldAllocationIds.length > 0
          ? new Date(Date.now() + input.holdTtlSeconds * 1000).toISOString()
          : null,
    },
  };
}

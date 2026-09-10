/**
 * The one staff/public command for multi-resource commitment (M2).
 *
 * Surfaces must call this rather than placing capacity and talent holds
 * separately. Person-time stays on `talent_holds`; units stay on capacity
 * pools. Refusals name which resource was unavailable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  reserveResourceSet,
  type ReserveResourceSetInput,
  type ReserveResourceSetResult,
} from "@/lib/resources/reserve-set";

export type CommitResourceSetInput = ReserveResourceSetInput & {
  /** Human label for logs / exceptions when the whole set fails. */
  label?: string | null;
};

export type NamedResourceRefusal = {
  ok: false;
  reason: string;
  error: string;
  /** Which pool or talent blocked the set — null when unknown. */
  unavailable: { kind: "capacity_pool" | "talent" | "unknown"; id: string | null; label?: string };
};

export async function commitResourceSet(
  admin: Pick<SupabaseClient, "rpc" | "from">,
  input: CommitResourceSetInput,
): Promise<ReserveResourceSetResult | NamedResourceRefusal> {
  const result = await reserveResourceSet(admin, input);
  if (result.ok) return result;

  const unavailable =
    result.failedPoolId != null
      ? { kind: "capacity_pool" as const, id: result.failedPoolId }
      : result.failedTalentId != null
        ? { kind: "talent" as const, id: result.failedTalentId }
        : { kind: "unknown" as const, id: null };

  const named =
    unavailable.kind === "talent"
      ? "A person in this booking is not free for that time."
      : unavailable.kind === "capacity_pool"
        ? "A room, station or seat in this booking is not available."
        : result.error;

  return {
    ok: false,
    reason: result.reason,
    error: input.label ? `${input.label}: ${named}` : named,
    unavailable,
    failedPoolId: result.failedPoolId,
    failedTalentId: result.failedTalentId,
  };
}

/** Re-export the engine so callers import one module. */
export { reserveResourceSet, expandedHoldWindow, spaceCapacityPool } from "@/lib/resources/reserve-set";

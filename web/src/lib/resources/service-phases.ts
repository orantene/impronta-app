/**
 * P7-06 — phases of one appointment are one resource set (L54).
 *
 * A colour service holds the chair for colour, nothing during development,
 * and the wash station only for rinse. Those windows are several holds; the
 * command is still one reserveResourceSet so a competing booking cannot take
 * any committed phase.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReserveRequest } from "@/lib/capacity/reserve";
import {
  reserveResourceSet,
  type ReserveResourceSetResult,
  type ResourceHoldRequest,
} from "@/lib/resources/reserve-set";

export type ServicePhase = {
  key: string;
  holds?: readonly ResourceHoldRequest[];
  capacity?: readonly ReserveRequest[];
};

export async function reserveServicePhases(
  admin: Pick<SupabaseClient, "rpc" | "from">,
  input: {
    tenantId: string;
    /** Stable name for this appointment's reservation, so a retry is a replay. */
    operationKey: string;
    actorUserId?: string | null;
    ttlSeconds?: number | null;
    phases: readonly ServicePhase[];
  },
): Promise<ReserveResourceSetResult> {
  const holds = input.phases.flatMap((p) => [...(p.holds ?? [])]);
  const capacity = input.phases.flatMap((p) => [...(p.capacity ?? [])]);
  return reserveResourceSet(admin, {
    tenantId: input.tenantId,
    operationKey: input.operationKey,
    actorUserId: input.actorUserId,
    ttlSeconds: input.ttlSeconds,
    holds,
    capacity,
  });
}

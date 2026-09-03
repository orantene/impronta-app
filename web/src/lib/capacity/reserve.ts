/**
 * reserve.ts — typed server wrappers over the capacity RPCs.
 *
 * The RPCs are SECURITY DEFINER and revoked from PUBLIC, anon and authenticated
 * (20261229000200), so every call here goes through the service-role client and
 * every caller must have already decided the request is legitimate. This module
 * enforces nothing about who may buy; it enforces that not more than N are sold.
 *
 * Refusals come back as DATA, never as a thrown error: `{ok: false, reason}`.
 * That distinction matters downstream — "sold out" is a thing to render, "the
 * database is unreachable" is a thing to alert on, and collapsing the two is how
 * a storefront ends up showing "something went wrong" for a full class.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type {
  CapacityRefusalReason,
  CommitResult,
  ReleaseResult,
  ReserveBatchResult,
  ReserveResult,
} from "./types";

export type ReserveRequest = {
  poolId: string;
  startsAt?: string | null;
  endsAt?: string | null;
  units?: number;
};

type Rpc = Pick<SupabaseClient, "rpc">;

function client(given?: Rpc): Rpc | null {
  return (given ?? createServiceRoleClient()) as Rpc | null;
}

/**
 * A transport failure is not a refusal, but it must be reported as one, because
 * the alternative is a caller that treats "unknown" as "available".
 *
 * It reports `unavailable`, NOT `pool_not_found`. Both are safe — neither can
 * oversell, and neither claims availability we could not verify — but they are
 * different sentences to a customer. "This does not exist" ends the visit;
 * "something went wrong, try again" does not. That is the only refusal in this
 * enum a person can act on, and the earlier version collapsed it into one they
 * cannot. It also kept outages out of every reason-based metric.
 */
function transportFailure(scope: string, err: unknown): CapacityRefusalReason {
  logServerError(scope, err);
  return "unavailable";
}

/** Reserve units on one pool. Returns a hold that expires unless committed. */
export async function reserveCapacity(
  req: ReserveRequest & { ttlSeconds?: number | null; orderLineId?: string | null; createdBy?: string | null },
  admin?: Rpc,
): Promise<ReserveResult> {
  const db = client(admin);
  if (!db) {
    return { ok: false, reason: transportFailure("capacity/reserve", "no service-role client"), blockingPoolId: null };
  }
  const { data, error } = await db.rpc("reserve_capacity", {
    p_pool_id: req.poolId,
    p_starts_at: req.startsAt ?? null,
    p_ends_at: req.endsAt ?? null,
    p_units: req.units ?? 1,
    p_ttl_seconds: req.ttlSeconds ?? null,
    p_order_line_id: req.orderLineId ?? null,
    p_created_by: req.createdBy ?? null,
  });
  if (error) {
    return { ok: false, reason: transportFailure("capacity/reserve", error), blockingPoolId: null };
  }
  const r = data as Record<string, unknown> | null;
  if (r?.ok === true) {
    return {
      ok: true,
      allocationId: String(r.allocation_id),
      expiresAt: String(r.expires_at),
      units: Number(r.units),
    };
  }
  return {
    ok: false,
    reason: (r?.reason as CapacityRefusalReason) ?? "unavailable",
    blockingPoolId: (r?.blocking_pool_id as string | null) ?? null,
  };
}

/**
 * Reserve across several pools, all or nothing: dinner plus show, table plus
 * two seats. Either every leg is held or nothing is written.
 */
export async function reserveCapacityBatch(
  requests: readonly ReserveRequest[],
  opts: { ttlSeconds?: number | null; orderLineId?: string | null; createdBy?: string | null } = {},
  admin?: Rpc,
): Promise<ReserveBatchResult> {
  if (requests.length === 0) return { ok: false, reason: "empty_batch", failedPoolId: null };
  const db = client(admin);
  if (!db) {
    const reason = transportFailure("capacity/reserve-batch", "no service-role client");
    return { ok: false, reason, failedPoolId: null };
  }
  const { data, error } = await db.rpc("reserve_capacity_batch", {
    p_requests: requests.map((r) => ({
      pool_id: r.poolId,
      starts_at: r.startsAt ?? null,
      ends_at: r.endsAt ?? null,
      units: r.units ?? 1,
    })),
    p_ttl_seconds: opts.ttlSeconds ?? null,
    p_order_line_id: opts.orderLineId ?? null,
    p_created_by: opts.createdBy ?? null,
  });
  if (error) {
    return { ok: false, reason: transportFailure("capacity/reserve-batch", error), failedPoolId: null };
  }
  const r = data as Record<string, unknown> | null;
  if (r?.ok === true) {
    return {
      ok: true,
      allocationIds: ((r.allocation_ids as string[] | null) ?? []).map(String),
      expiresAt: (r.expires_at as string | null) ?? null,
    };
  }
  return {
    ok: false,
    reason: (r?.reason as CapacityRefusalReason) ?? "unavailable",
    failedPoolId: (r?.failed_pool_id as string | null) ?? null,
  };
}

/**
 * Turn holds into committed units. Call this when money has actually landed.
 * REFUSES an expired hold rather than reviving it: those units may already
 * belong to someone who reserved after the lapse.
 */
export async function commitCapacity(
  allocationIds: readonly string[],
  orderLineId?: string | null,
  admin?: Rpc,
): Promise<CommitResult> {
  if (allocationIds.length === 0) return { ok: true, committed: 0 };
  const db = client(admin);
  if (!db) return { ok: false, reason: "missing", allocationId: null };
  const { data, error } = await db.rpc("commit_capacity", {
    p_allocation_ids: [...allocationIds],
    p_order_line_id: orderLineId ?? null,
  });
  if (error) {
    logServerError("capacity/commit", error);
    return { ok: false, reason: "missing", allocationId: null };
  }
  const r = data as Record<string, unknown> | null;
  if (r?.ok === true) return { ok: true, committed: Number(r.committed ?? 0) };
  return {
    ok: false,
    reason: (r?.reason as "expired" | "missing" | "released") ?? "missing",
    allocationId: (r?.allocation_id as string | null) ?? null,
  };
}

/**
 * Give units back. Safe to call more than once for the same allocation: the
 * clamp is structural, because remaining is derived from rows rather than held
 * in a counter, so a second release changes nothing and reports zero freed.
 */
export async function releaseCapacity(
  allocationIds: readonly string[],
  admin?: Rpc,
): Promise<ReleaseResult> {
  if (allocationIds.length === 0) return { ok: true, released: 0, alreadyReleased: 0 };
  const db = client(admin);
  if (!db) return { ok: true, released: 0, alreadyReleased: 0 };
  const { data, error } = await db.rpc("release_capacity", { p_allocation_ids: [...allocationIds] });
  if (error) {
    logServerError("capacity/release", error);
    return { ok: true, released: 0, alreadyReleased: 0 };
  }
  const r = data as Record<string, unknown> | null;
  return {
    ok: true,
    released: Number(r?.released ?? 0),
    alreadyReleased: Number(r?.already_released ?? 0),
  };
}

/** Units left, as the buyer experiences it: tightest constraint in the chain. */
export async function capacityRemaining(
  poolId: string,
  window: { startsAt?: string | null; endsAt?: string | null } = {},
  admin?: Rpc,
): Promise<number | null> {
  const db = client(admin);
  if (!db) return null;
  const { data, error } = await db.rpc("capacity_remaining_public", {
    p_pool_id: poolId,
    p_starts_at: window.startsAt ?? null,
    p_ends_at: window.endsAt ?? null,
  });
  if (error) {
    logServerError("capacity/remaining", error);
    return null;
  }
  return data == null ? null : Number(data);
}

/**
 * A pool's configured hold TTL in seconds, or null when there is no pool.
 *
 * Callers that place a calendar hold AND consume units read this so the two
 * lapse together. Without it the units come back in fifteen minutes while the
 * calendar slot stays blocked for two days, and the slot looks booked to
 * everyone while the thing that was booked is on sale again.
 */
export async function capacityHoldTtlSeconds(
  poolId: string | null | undefined,
  admin?: Pick<SupabaseClient, "from">,
): Promise<number | null> {
  if (!poolId) return null;
  const db = (admin ?? createServiceRoleClient()) as Pick<SupabaseClient, "from"> | null;
  if (!db) return null;
  const { data, error } = await db
    .from("capacity_pools")
    .select("hold_ttl_seconds")
    .eq("id", poolId)
    .maybeSingle();
  if (error) {
    logServerError("capacity/hold-ttl", error);
    return null;
  }
  const secs = (data as { hold_ttl_seconds?: number } | null)?.hold_ttl_seconds;
  return typeof secs === "number" && Number.isFinite(secs) ? Math.round(secs) : null;
}

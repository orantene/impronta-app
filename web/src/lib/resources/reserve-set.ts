/**
 * L54 — one command reserves a set across `talent_holds` and capacity pools.
 *
 * THE WHOLE SET IS ONE RPC. `reserve_resource_set_v2` claims an operation key,
 * checks each pool's tenant, runs the capacity batch and inserts the calendar
 * holds inside a single transaction, so either every resource is held or none
 * is. This module composes the request, reads the answer, and writes nothing
 * of its own.
 *
 * WHY THERE IS NO LONGER A SECOND PATH. This file used to fall through to a
 * TypeScript reservation (attemptSet / unwindSet) whenever the RPC errored or
 * answered `unavailable`. `unavailable` means the TRANSPORT failed — which is
 * exactly the case where the server may have committed and only the answer was
 * lost — so the fallback re-ran the reservation on top of rows that already
 * existed and allocated the same station, seat or person twice. A lost answer
 * must never cause a second write attempt. It is now a refusal, and the caller
 * may retry the whole command safely because `operationKey` makes the retry
 * recognisable: the server returns the FIRST answer with `already: true`
 * instead of reserving again.
 *
 * `deadlock` is the one reason worth retrying here, because the RPC is atomic:
 * a deadlocked attempt rolled itself back and left nothing behind.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type { ReserveRequest } from "@/lib/capacity/reserve";
import type { CapacityRefusalReason } from "@/lib/capacity/types";

/** Total attempts, not extra ones: three RPC calls at most, then refuse. */
const MAX_DEADLOCK_ATTEMPTS = 3;

export type ResourceHoldRequest = {
  talentProfileId: string;
  startsAt: string;
  endsAt: string;
  title?: string;
  inquiryId?: string | null;
  /** Extends the hold earlier than the service start (travel / setup). */
  bufferBeforeSeconds?: number;
  /** Extends the hold later than the service end (travel / cleanup). */
  bufferAfterSeconds?: number;
};

export type ReserveResourceSetInput = {
  tenantId: string;
  /**
   * The caller's name for THIS command, stable across retries — the whole
   * reason a retry is safe. Derive it from something the caller already has
   * (`order:<id>:reserve`, `pos-hold:<id>`); never from a clock or a random,
   * which would make every retry a new reservation.
   */
  operationKey: string;
  actorUserId?: string | null;
  holds?: readonly ResourceHoldRequest[];
  capacity?: readonly ReserveRequest[];
  ttlSeconds?: number | null;
};

export type ReserveResourceSetReason =
  | CapacityRefusalReason
  | "slot_taken"
  | "invalid"
  | "deadlock"
  | "wrong_tenant"
  | "bad_input"
  /** Another attempt on this key is still settling; nothing was written here. */
  | "in_flight";

export type ReserveResourceSetResult =
  | {
      ok: true;
      /** True when this reply is the stored answer of an earlier identical command. */
      already: boolean;
      holdIds: string[];
      allocationIds: string[];
      expiresAt: string | null;
    }
  | {
      ok: false;
      reason: ReserveResourceSetReason;
      error: string;
      failedPoolId: string | null;
      failedTalentId: string | null;
    };

type Admin = Pick<SupabaseClient, "rpc" | "from">;

export function expandedHoldWindow(hold: ResourceHoldRequest): { startsAt: string; endsAt: string } | { ok: false; error: string } {
  const before = hold.bufferBeforeSeconds ?? 0;
  const after = hold.bufferAfterSeconds ?? 0;
  if (!Number.isInteger(before) || before < 0 || !Number.isInteger(after) || after < 0) {
    return { ok: false, error: "Travel buffer must be zero or more seconds." };
  }
  const startMs = Date.parse(hold.startsAt);
  const endMs = Date.parse(hold.endsAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { ok: false, error: "End must be after start." };
  }
  return {
    startsAt: new Date(startMs - before * 1000).toISOString(),
    endsAt: new Date(endMs + after * 1000).toISOString(),
  };
}

/**
 * `_capacity_reserve_locked` is service-role SECURITY DEFINER and keys only
 * on `pool_id`. A UUID from another workspace would otherwise allocate.
 *
 * The RPC checks this too. This read runs first only so the refusal can name
 * the pool the operator recognises rather than a generic engine reason; it
 * writes nothing either way.
 */
export async function assertCapacityPoolsForTenant(
  admin: Pick<SupabaseClient, "from">,
  tenantId: string,
  poolIds: readonly string[],
): Promise<
  | { ok: true }
  | {
      ok: false;
      reason: "wrong_tenant" | "pool_not_found" | "unavailable";
      error: string;
      failedPoolId: string | null;
    }
> {
  const unique = [...new Set(poolIds.filter((id) => id))];
  if (unique.length === 0) return { ok: true };
  const { data, error } = await admin
    .from("capacity_pools")
    .select("id, tenant_id")
    .in("id", unique);
  if (error) {
    logServerError("resources.reserveSet.pools", error);
    return {
      ok: false,
      reason: "unavailable",
      error: "Could not hold those resources.",
      failedPoolId: null,
    };
  }
  const byId = new Map(
    ((data ?? []) as Array<{ id: string; tenant_id: string }>).map((row) => [row.id, row]),
  );
  for (const id of unique) {
    const row = byId.get(id);
    if (!row) {
      return {
        ok: false,
        reason: "pool_not_found",
        error: "That resource is not in the capacity engine.",
        failedPoolId: id,
      };
    }
    if (row.tenant_id !== tenantId) {
      return {
        ok: false,
        reason: "wrong_tenant",
        error: "That resource is not on this workspace.",
        failedPoolId: id,
      };
    }
  }
  return { ok: true };
}

/** One sentence per refusal, so a surface never has to invent one. */
function refusalMessage(reason: ReserveResourceSetReason): string {
  if (reason === "sold_out" || reason === "slot_taken" || reason === "ancestor_full") {
    return "That resource is not free.";
  }
  if (reason === "deadlock") return "Could not hold those resources. Try again.";
  if (reason === "in_flight") return "That reservation is already being held. Try again in a moment.";
  return "Could not hold those resources.";
}

function unavailable(): ReserveResourceSetResult {
  return {
    ok: false,
    reason: "unavailable",
    error: "Could not hold those resources.",
    failedPoolId: null,
    failedTalentId: null,
  };
}

type ReserveSetReply = {
  ok?: boolean;
  already?: boolean;
  reason?: string;
  hold_ids?: string[];
  allocation_ids?: string[];
  expires_at?: string | null;
  failed_pool_id?: string | null;
  failed_talent_id?: string | null;
};

export async function reserveResourceSet(
  admin: Admin,
  input: ReserveResourceSetInput,
): Promise<ReserveResourceSetResult> {
  const holds = input.holds ?? [];
  const capacity = input.capacity ?? [];

  const operationKey = (input.operationKey ?? "").trim();
  if (operationKey.length === 0) {
    // Refusing beats inventing one. A generated key makes every retry a fresh
    // reservation, which is the double-allocation this module exists to close.
    return {
      ok: false,
      reason: "bad_input",
      error: "Could not hold those resources.",
      failedPoolId: null,
      failedTalentId: null,
    };
  }

  if (holds.length === 0 && capacity.length === 0) {
    return {
      ok: false,
      reason: "empty_batch",
      error: "Nothing to reserve.",
      failedPoolId: null,
      failedTalentId: null,
    };
  }

  // Window arithmetic is checked here only for the sentence it produces; the
  // RPC re-derives the same windows from the raw values plus the buffers.
  for (const hold of holds) {
    const window = expandedHoldWindow(hold);
    if ("ok" in window) {
      return {
        ok: false,
        reason: "invalid",
        error: window.error,
        failedPoolId: null,
        failedTalentId: hold.talentProfileId,
      };
    }
  }

  const owned = await assertCapacityPoolsForTenant(
    admin,
    input.tenantId,
    capacity.map((c) => c.poolId),
  );
  if (!owned.ok) {
    return {
      ok: false,
      reason: owned.reason,
      error: owned.error,
      failedPoolId: owned.failedPoolId,
      failedTalentId: null,
    };
  }

  if (typeof admin.rpc !== "function") {
    logServerError("resources.reserveSet.rpc", "admin client has no rpc; refusing rather than writing");
    return unavailable();
  }

  const args = {
    p_tenant_id: input.tenantId,
    p_operation_key: operationKey,
    p_actor_id: input.actorUserId ?? null,
    p_ttl_seconds: input.ttlSeconds ?? null,
    p_capacity: capacity.map((c) => ({
      pool_id: c.poolId,
      units: c.units,
      starts_at: c.startsAt ?? null,
      ends_at: c.endsAt ?? null,
      order_line_id: c.orderLineId ?? null,
      ttl_seconds: c.ttlSeconds ?? null,
    })),
    p_holds: holds.map((h) => ({
      talent_profile_id: h.talentProfileId,
      starts_at: h.startsAt,
      ends_at: h.endsAt,
      title: h.title ?? null,
      inquiry_id: h.inquiryId ?? null,
      buffer_before_seconds: h.bufferBeforeSeconds ?? 0,
      buffer_after_seconds: h.bufferAfterSeconds ?? 0,
    })),
  };

  for (let attempt = 1; attempt <= MAX_DEADLOCK_ATTEMPTS; attempt += 1) {
    const { data, error } = await admin.rpc("reserve_resource_set_v2", args);
    if (error) {
      // THE POINT OF THIS MODULE. The reservation may well have committed; we
      // simply did not hear. Doing it again here is what allocated twice.
      logServerError("resources.reserveSet.rpc", error);
      return unavailable();
    }

    const reply = (data ?? {}) as ReserveSetReply;
    if (reply.ok === true) {
      return {
        ok: true,
        already: reply.already === true,
        holdIds: reply.hold_ids ?? [],
        allocationIds: reply.allocation_ids ?? [],
        expiresAt: reply.expires_at ?? null,
      };
    }

    const reason = (reply.reason ?? "unavailable") as ReserveResourceSetReason;
    if (reason === "deadlock" && attempt < MAX_DEADLOCK_ATTEMPTS) continue;
    return {
      ok: false,
      reason,
      error: refusalMessage(reason),
      failedPoolId: reply.failed_pool_id ?? null,
      failedTalentId: reply.failed_talent_id ?? null,
    };
  }

  return {
    ok: false,
    reason: "deadlock",
    error: refusalMessage("deadlock"),
    failedPoolId: null,
    failedTalentId: null,
  };
}

/**
 * Lookup the capacity pool for a physical space (station, room, cabana).
 * Stations are units of a space pool, not people.
 */
export async function spaceCapacityPool(
  admin: Pick<SupabaseClient, "from">,
  input: { tenantId: string; spaceId: string; poolKey?: string },
): Promise<{ ok: true; poolId: string; unitsTotal: number } | { ok: false; reason: "not_found" | "unavailable"; error: string }> {
  const { data, error } = await admin
    .from("capacity_pools")
    .select("id, units_total")
    .eq("tenant_id", input.tenantId)
    .eq("subject_kind", "space")
    .eq("subject_id", input.spaceId)
    .eq("pool_key", input.poolKey ?? "default")
    .maybeSingle();
  if (error) {
    logServerError("resources.spaceCapacityPool", error);
    return { ok: false, reason: "unavailable", error: "Could not read that station." };
  }
  if (!data) return { ok: false, reason: "not_found", error: "That station is not in the capacity engine." };
  const row = data as { id: string; units_total: number };
  return { ok: true, poolId: row.id, unitsTotal: row.units_total };
}

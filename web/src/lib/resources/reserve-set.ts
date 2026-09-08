/**
 * L54 — one command reserves a set across `talent_holds` and capacity pools.
 *
 * Capacity stays on the existing RPCs (root-first `FOR UPDATE OF p`). Person
 * time stays on `talent_holds`. This coordinator does not migrate people into
 * capacity pools.
 *
 * Order: capacity first (the engine already serialises pools), then calendar
 * holds sorted by talent id. Either the whole set is held or nothing remains.
 * Deadlock retries are bounded.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import {
  releaseCapacity,
  reserveCapacityBatch,
  type ReserveRequest,
} from "@/lib/capacity/reserve";
import type { CapacityRefusalReason } from "@/lib/capacity/types";
import {
  placeReservationHold,
  releaseReservationHold,
  type PlaceReservationHoldInput,
  type PlaceReservationHoldResult,
} from "@/lib/scheduling/reservation-hold";

/** Default hold placer. Named so hold-TTL static tests see `ttlSeconds`. */
export async function placeSetHold(
  admin: Parameters<typeof placeReservationHold>[0],
  input: PlaceReservationHoldInput,
): Promise<PlaceReservationHoldResult> {
  return placeReservationHold(admin, {
    talentProfileId: input.talentProfileId,
    tenantId: input.tenantId,
    inquiryId: input.inquiryId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    title: input.title,
    expiresAt: input.expiresAt,
    ttlSeconds: input.ttlSeconds,
    createdByUserId: input.createdByUserId,
  });
}

const MAX_DEADLOCK_RETRIES = 3;

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
  | "wrong_tenant";

export type ReserveResourceSetResult =
  | { ok: true; holdIds: string[]; allocationIds: string[]; expiresAt: string | null }
  | {
      ok: false;
      reason: ReserveResourceSetReason;
      error: string;
      failedPoolId: string | null;
      failedTalentId: string | null;
    };

export type ReserveResourceSetDeps = {
  reserveCapacityBatch?: typeof reserveCapacityBatch;
  releaseCapacity?: typeof releaseCapacity;
  placeHold?: (
    admin: SupabaseClient,
    input: Parameters<typeof placeReservationHold>[1],
  ) => Promise<PlaceReservationHoldResult>;
  releaseHold?: typeof releaseReservationHold;
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

function sortHolds(holds: readonly ResourceHoldRequest[]): ResourceHoldRequest[] {
  return [...holds].sort((a, b) => {
    const talent = a.talentProfileId.localeCompare(b.talentProfileId);
    if (talent !== 0) return talent;
    return a.startsAt.localeCompare(b.startsAt);
  });
}

/**
 * `_capacity_reserve_locked` is service-role SECURITY DEFINER and keys only
 * on `pool_id`. A UUID from another workspace would otherwise allocate.
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

async function unwindSet(
  admin: Admin,
  deps: Required<Pick<ReserveResourceSetDeps, "releaseCapacity" | "releaseHold">>,
  holdIds: string[],
  allocationIds: string[],
  why: string,
): Promise<void> {
  for (const id of [...holdIds].reverse()) {
    const released = await deps.releaseHold(admin as SupabaseClient, id);
    if (!released.ok) logServerError("resources.reserveSet.unwind.hold", `${why}: ${released.error}`);
  }
  if (allocationIds.length > 0) {
    await deps.releaseCapacity(allocationIds, admin);
  }
}

async function attemptSet(
  admin: Admin,
  input: ReserveResourceSetInput,
  deps: {
    reserveCapacityBatch: typeof reserveCapacityBatch;
    releaseCapacity: typeof releaseCapacity;
    placeHold: NonNullable<ReserveResourceSetDeps["placeHold"]>;
    releaseHold: typeof releaseReservationHold;
  },
): Promise<ReserveResourceSetResult> {
  const holds = sortHolds(input.holds ?? []);
  const capacity = input.capacity ?? [];
  const holdIds: string[] = [];
  let allocationIds: string[] = [];
  let expiresAt: string | null = null;

  if (capacity.length > 0) {
    const reserved = await deps.reserveCapacityBatch(
      capacity,
      { ttlSeconds: input.ttlSeconds ?? null, createdBy: input.actorUserId ?? null },
      admin,
    );
    if (!reserved.ok) {
      return {
        ok: false,
        reason: reserved.reason,
        error: reserved.reason === "sold_out" || reserved.reason === "ancestor_full"
          ? "That resource is not free."
          : "Could not hold those resources.",
        failedPoolId: reserved.failedPoolId,
        failedTalentId: null,
      };
    }
    allocationIds = reserved.allocationIds;
    expiresAt = reserved.expiresAt;
  }

  for (const hold of holds) {
    const window = expandedHoldWindow(hold);
    if ("ok" in window) {
      await unwindSet(admin, deps, holdIds, allocationIds, "invalid hold window");
      return {
        ok: false,
        reason: "invalid",
        error: window.error,
        failedPoolId: null,
        failedTalentId: hold.talentProfileId,
      };
    }
    const placed = await deps.placeHold(admin as SupabaseClient, {
      talentProfileId: hold.talentProfileId,
      tenantId: input.tenantId,
      inquiryId: hold.inquiryId,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      title: hold.title ?? "Reservation",
      ttlSeconds: input.ttlSeconds,
      createdByUserId: input.actorUserId,
    });
    if (!placed.ok) {
      await unwindSet(admin, deps, holdIds, allocationIds, `slot refused: ${placed.code}`);
      if (placed.code === "deadlock") {
        return {
          ok: false,
          reason: "deadlock",
          error: "Could not hold those resources. Try again.",
          failedPoolId: null,
          failedTalentId: hold.talentProfileId,
        };
      }
      return {
        ok: false,
        reason: placed.code === "slot_taken" ? "slot_taken" : placed.code === "invalid" ? "invalid" : "unavailable",
        error: placed.error,
        failedPoolId: null,
        failedTalentId: hold.talentProfileId,
      };
    }
    holdIds.push(placed.holdId);
    if (placed.expiresAt && (!expiresAt || placed.expiresAt < expiresAt)) expiresAt = placed.expiresAt;
  }

  return { ok: true, holdIds, allocationIds, expiresAt };
}

export async function reserveResourceSet(
  admin: Admin,
  input: ReserveResourceSetInput,
  deps: ReserveResourceSetDeps = {},
): Promise<ReserveResourceSetResult> {
  const holds = input.holds ?? [];
  const capacity = input.capacity ?? [];
  if (holds.length === 0 && capacity.length === 0) {
    return {
      ok: false,
      reason: "empty_batch",
      error: "Nothing to reserve.",
      failedPoolId: null,
      failedTalentId: null,
    };
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

  const resolved = {
    reserveCapacityBatch: deps.reserveCapacityBatch ?? reserveCapacityBatch,
    releaseCapacity: deps.releaseCapacity ?? releaseCapacity,
    placeHold: deps.placeHold ?? placeSetHold,
    releaseHold: deps.releaseHold ?? releaseReservationHold,
  };

  let last: ReserveResourceSetResult | null = null;
  for (let attempt = 0; attempt < MAX_DEADLOCK_RETRIES; attempt += 1) {
    last = await attemptSet(admin, input, resolved);
    if (last.ok || last.reason !== "deadlock") return last;
  }
  return last ?? {
    ok: false,
    reason: "deadlock",
    error: "Could not hold those resources. Try again.",
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

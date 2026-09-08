import "server-only";

/**
 * P3-05 — capacity attaches at collection, not line edits (L53).
 *
 * POS never calls `createPurchase`. The draft already exists; this command
 * holds the offering's pool (and a session window when the line names one)
 * before money moves. A later split allocation must not hold again.
 */

import { logServerError } from "@/lib/server/safe-error";
import type { ReserveRequest } from "@/lib/capacity/reserve";
import {
  reserveResourceSet,
  type ReserveResourceSetDeps,
  type ReserveResourceSetResult,
  type ResourceHoldRequest,
} from "@/lib/resources/reserve-set";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (...args: any[]) => any;
};

export type HoldDraftCapacityResult =
  | { ok: true; allocationIds: string[]; holdIds: string[]; skipped: boolean }
  | {
      ok: false;
      reason: "sold_out" | "wrong_tenant" | "not_found" | "not_draft" | "unavailable";
      error: string;
    };

function num(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function holdDraftOrderCapacity(
  admin: Admin,
  input: { tenantId: string; orderId: string; actorUserId?: string | null },
  deps: ReserveResourceSetDeps = {},
): Promise<HoldDraftCapacityResult> {
  if (!input.tenantId || !input.orderId) {
    return { ok: false, reason: "not_found", error: "That sale is gone." };
  }

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .select("id, tenant_id, status")
    .eq("id", input.orderId)
    .maybeSingle();
  if (orderErr) {
    logServerError("pos.holdCapacity.order", orderErr);
    return { ok: false, reason: "unavailable", error: "Could not hold those places." };
  }
  if (!order) return { ok: false, reason: "not_found", error: "That sale is gone." };
  const orderRow = order as { id: string; tenant_id: string; status: string };
  if (orderRow.tenant_id !== input.tenantId) {
    return { ok: false, reason: "wrong_tenant", error: "That sale is not in this workspace." };
  }
  if (orderRow.status !== "draft" && orderRow.status !== "pending_payment") {
    return { ok: false, reason: "not_draft", error: "This sale is no longer open." };
  }

  const { data: lineRows, error: lineErr } = await admin
    .from("order_lines")
    .select("id, offering_id, session_id, units")
    .eq("order_id", input.orderId);
  if (lineErr) {
    logServerError("pos.holdCapacity.lines", lineErr);
    return { ok: false, reason: "unavailable", error: "Could not hold those places." };
  }
  const lines = (lineRows ?? []) as Array<{
    id: string;
    offering_id: string | null;
    session_id: string | null;
    units: number | string;
  }>;
  const lineIds = lines.map((l) => l.id);
  if (lineIds.length > 0) {
    const { data: allocRows, error: allocErr } = await admin
      .from("capacity_allocations")
      .select("id, released_at")
      .eq("tenant_id", input.tenantId)
      .in("order_line_id", lineIds);
    if (allocErr) {
      logServerError("pos.holdCapacity.existing", allocErr);
      return { ok: false, reason: "unavailable", error: "Could not hold those places." };
    }
    const live = ((allocRows ?? []) as Array<{ id: string; released_at: string | null }>).filter(
      (a) => !a.released_at,
    );
    if (live.length > 0) {
      return { ok: true, allocationIds: live.map((a) => a.id), holdIds: [], skipped: true };
    }
  }

  const capacity: ReserveRequest[] = [];
  const holds: ResourceHoldRequest[] = [];
  for (const line of lines) {
    if (!line.offering_id) continue;
    const { data: offering, error: offErr } = await admin
      .from("talent_offerings")
      .select("id, capacity_pool_id, talent_profile_id")
      .eq("id", line.offering_id)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (offErr) {
      logServerError("pos.holdCapacity.offering", offErr);
      return { ok: false, reason: "unavailable", error: "Could not hold those places." };
    }
    const off = offering as {
      capacity_pool_id?: string | null;
      talent_profile_id?: string | null;
    } | null;
    if (!off) continue;

    let startsAt: string | null = null;
    let endsAt: string | null = null;
    if (line.session_id) {
      const { data: session, error: sessionErr } = await admin
        .from("sessions")
        .select("id, tenant_id, starts_at, ends_at")
        .eq("id", line.session_id)
        .maybeSingle();
      if (sessionErr) {
        logServerError("pos.holdCapacity.session", sessionErr);
        return { ok: false, reason: "unavailable", error: "Could not hold those places." };
      }
      if (!session) return { ok: false, reason: "not_found", error: "That class is not here." };
      const sess = session as {
        tenant_id: string;
        starts_at: string;
        ends_at: string;
      };
      if (sess.tenant_id !== input.tenantId) {
        return { ok: false, reason: "wrong_tenant", error: "That class is not here." };
      }
      startsAt = sess.starts_at;
      endsAt = sess.ends_at;
    }

    const units = Math.max(1, Math.trunc(num(line.units)));
    if (off.capacity_pool_id) {
      capacity.push({
        poolId: off.capacity_pool_id,
        units,
        startsAt,
        endsAt,
        orderLineId: line.id,
      });
    }
    if (off.talent_profile_id && startsAt && endsAt) {
      holds.push({
        talentProfileId: off.talent_profile_id,
        startsAt,
        endsAt,
        title: "Walk-in",
      });
    }
  }

  if (capacity.length === 0 && holds.length === 0) {
    return { ok: true, allocationIds: [], holdIds: [], skipped: true };
  }

  const reserved: ReserveResourceSetResult = await reserveResourceSet(
    admin as never,
    {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      capacity,
      holds,
    },
    deps,
  );
  if (!reserved.ok) {
    if (reserved.reason === "sold_out" || reserved.reason === "ancestor_full") {
      return { ok: false, reason: "sold_out", error: "That is no longer free." };
    }
    if (reserved.reason === "wrong_tenant") {
      return { ok: false, reason: "wrong_tenant", error: reserved.error };
    }
    return { ok: false, reason: "unavailable", error: reserved.error };
  }
  return {
    ok: true,
    allocationIds: reserved.allocationIds,
    holdIds: reserved.holdIds,
    skipped: false,
  };
}

/**
 * TUL-1375 · Hold the chair, room or station on every booking path.
 *
 * A service links the shared resources it needs (`talent_offerings.attributes.resourceSet
 * .spaceIds`: a chair, room, station, bed, bay, vehicle or equipment unit, any `spaces`
 * row with a capacity pool). Every booking path holds those pools for the booking window
 * through the ONE engine command (`reserveResourceSet` -> `reserve_resource_set_v2`),
 * which serializes on the pool and refuses an overlap, so two bookings can never take
 * the same resource at the same time on any path. Works for any business with shared
 * resources (salon, studio, clinic, rental, restaurant): nothing here names a tenant.
 *
 *   - Order paths (public /book, instant book, appointment and session pickers, POS desk,
 *     reservations, cart): `createPurchase` adds the linked pools to the order's own
 *     atomic batch (`withLinkedResourceNeeds`); cancel, expiry and reschedule already
 *     act on the order's allocations.
 *   - Request / offer paths (no order yet): allocations are keyed
 *     `inquiry:<id>:resources`; held with the request, committed when the offer is
 *     accepted, released on decline / expiry (pool TTL) / cancel.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { commitCapacity, releaseCapacity } from "@/lib/capacity";
import { logServerError } from "@/lib/server/safe-error";
import type { CapacityNeed } from "@/lib/orders/capacity-requests";
import { parseOfferingResourceSet } from "./offering-resource-set";
import { reserveResourceSet, spaceCapacityPool } from "./reserve-set";

type Admin = Pick<SupabaseClient, "rpc" | "from">;

export type BookingWindow = { startsAt: string; endsAt: string };

/**
 * Request/offer resources are keyed per inquiry AND window: the engine replays the first
 * answer for a repeated key (retry safety), so a new time needs a new key. Lookups use
 * the inquiry prefix.
 */
export function inquiryResourcesPrefix(inquiryId: string): string {
  return `inquiry:${inquiryId}:resources`;
}

export function inquiryResourcesKey(inquiryId: string, window: BookingWindow): string {
  return `${inquiryResourcesPrefix(inquiryId)}:${Date.parse(window.startsAt)}-${Date.parse(window.endsAt)}`;
}

/**
 * PURE: add each line's linked resource pools to a purchase's capacity needs, once per
 * pool (a caller that already holds a pool, e.g. instant book's room, is not doubled).
 * No window = nothing held in time.
 */
export function withLinkedResourceNeeds(
  needs: readonly CapacityNeed[],
  poolsByOffering: ReadonlyMap<string, readonly string[]>,
  window: BookingWindow | null,
): CapacityNeed[] {
  const out = [...needs];
  if (!window) return out;
  const seen = new Set(out.map((n) => n.poolId));
  for (const [offeringId, poolIds] of poolsByOffering) {
    for (const poolId of poolIds) {
      if (seen.has(poolId)) continue;
      seen.add(poolId);
      out.push({ offeringId, poolId, units: 1, startsAt: window.startsAt, endsAt: window.endsAt });
    }
  }
  return out;
}

/**
 * The order pipeline's capacity needs plus the chair, room or station each booked service
 * needs, for the purchase's time window, once per pool (instant book's room is not
 * doubled). Every order path with a window gets it: public /book, instant book, the
 * appointment picker, the POS desk, reservations and carts. A linked resource with no
 * pool refuses rather than selling a time nobody holds. No window: unchanged.
 */
export async function purchaseNeedsWithLinkedResources(
  admin: Pick<SupabaseClient, "from">,
  input: {
    tenantId: string;
    lines: ReadonlyArray<{ offeringId: string }>;
    capacity?: readonly CapacityNeed[] | null;
    reservation?: { startsAt: string; endsAt: string } | null;
  },
): Promise<{ ok: true; needs: CapacityNeed[] } | { ok: false; error: string }> {
  const base = [...(input.capacity ?? [])];
  if (!input.reservation) return { ok: true, needs: base };
  const linked = await loadLinkedResourcePools(admin, input.tenantId, input.lines.map((l) => l.offeringId));
  if (!linked.ok) return { ok: false, error: linked.error };
  return {
    ok: true,
    needs: withLinkedResourceNeeds(base, linked.poolsByOffering, {
      startsAt: input.reservation.startsAt,
      endsAt: input.reservation.endsAt,
    }),
  };
}

export type LinkedPoolsResult =
  | { ok: true; poolsByOffering: Map<string, string[]> }
  | { ok: false; error: string };

/**
 * The capacity pools of every resource linked to these services. A linked resource with
 * no pool refuses (fail closed): selling it without holding it is the double-booking.
 */
export async function loadLinkedResourcePools(
  admin: Pick<SupabaseClient, "from">,
  tenantId: string,
  offeringIds: readonly string[],
): Promise<LinkedPoolsResult> {
  const ids = [...new Set(offeringIds.filter(Boolean))];
  const poolsByOffering = new Map<string, string[]>();
  if (ids.length === 0) return { ok: true, poolsByOffering };
  const { data, error } = await admin
    .from("talent_offerings")
    .select("id, attributes")
    .eq("tenant_id", tenantId)
    .in("id", ids);
  if (error) {
    logServerError("resources.loadLinkedResourcePools", error);
    return { ok: false, error: "Could not read what this service needs." };
  }
  for (const row of (data ?? []) as Array<{ id: string; attributes: unknown }>) {
    const { spaceIds } = parseOfferingResourceSet(row.attributes);
    if (spaceIds.length === 0) continue;
    const pools: string[] = [];
    for (const spaceId of spaceIds) {
      const pool = await spaceCapacityPool(admin, { tenantId, spaceId });
      if (!pool.ok) return { ok: false, error: "A resource this service needs is not set up for booking." };
      pools.push(pool.poolId);
    }
    poolsByOffering.set(row.id, pools);
  }
  return { ok: true, poolsByOffering };
}

export type HoldResourcesResult =
  | { ok: true; allocationIds: string[] }
  | { ok: false; reason: "taken" | "unavailable"; error: string };

/** Hold pools for a window under one key, atomically (all or none). Safe to retry. */
export async function holdBookingResources(
  admin: Admin,
  input: {
    tenantId: string;
    operationKey: string;
    poolIds: readonly string[];
    window: BookingWindow;
    ttlSeconds?: number | null;
    actorUserId?: string | null;
  },
): Promise<HoldResourcesResult> {
  const pools = [...new Set(input.poolIds)];
  if (pools.length === 0) return { ok: true, allocationIds: [] };
  const set = await reserveResourceSet(admin, {
    tenantId: input.tenantId,
    operationKey: input.operationKey,
    actorUserId: input.actorUserId ?? null,
    ttlSeconds: input.ttlSeconds ?? null,
    capacity: pools.map((poolId) => ({
      poolId,
      units: 1,
      startsAt: input.window.startsAt,
      endsAt: input.window.endsAt,
    })),
  });
  if (set.ok) {
    if (set.already) {
      // A replayed answer for this key: only good if those allocations are still live.
      const live = await allocationsForKey(admin, input.tenantId, input.operationKey, ["hold", "committed"]);
      if (live === null || live.length < set.allocationIds.length) {
        return { ok: false, reason: "unavailable", error: "That hold was already given back. Pick the time again." };
      }
    }
    return { ok: true, allocationIds: set.allocationIds };
  }
  const taken = set.reason === "sold_out" || set.reason === "slot_taken" || set.reason === "ancestor_full";
  return { ok: false, reason: taken ? "taken" : "unavailable", error: set.error };
}

type KeyedAllocation = {
  id: string;
  state: string;
  starts_at: string | null;
  ends_at: string | null;
  pool_id: string;
  order_line_id: string | null;
};

async function allocationRowsForKey(
  admin: Pick<SupabaseClient, "from">,
  tenantId: string,
  operationKey: string,
  states: readonly string[],
): Promise<KeyedAllocation[] | null> {
  // Cleanup callers (cancel, request clean-up) must never be broken by this read: any
  // failure is logged and reported as "unknown" (null), never thrown.
  try {
    const { data, error } = await admin
      .from("capacity_allocations")
      .select("id, state, starts_at, ends_at, pool_id, order_line_id")
      .eq("tenant_id", tenantId)
      .like("operation_key", `${operationKey}%`)
      .in("state", [...states]);
    if (error) {
      logServerError("resources.allocationsForKey", error);
      return null;
    }
    return (data ?? []) as KeyedAllocation[];
  } catch (err) {
    logServerError("resources.allocationsForKey", err);
    return null;
  }
}

async function allocationsForKey(
  admin: Pick<SupabaseClient, "from">,
  tenantId: string,
  operationKey: string,
  states: readonly string[],
): Promise<string[] | null> {
  const rows = await allocationRowsForKey(admin, tenantId, operationKey, states);
  return rows === null ? null : rows.map((r) => r.id);
}

function sameInstant(a: string | null, b: string): boolean {
  return a != null && Date.parse(a) === Date.parse(b);
}

function inWindow(r: KeyedAllocation, w: BookingWindow): boolean {
  return sameInstant(r.starts_at, w.startsAt) && sameInstant(r.ends_at, w.endsAt);
}

/**
 * Cancel of a request-sourced booking: give back ONLY that booking's resources (its
 * window), never another booking's on the same request. Resources committed onto an
 * order line are the engine's (`cancel_booking_set` releases them by order).
 */
export async function releaseInquiryWindowResources(
  admin: Admin,
  input: { tenantId: string; inquiryId: string; window: BookingWindow },
): Promise<{ ok: boolean; released: number }> {
  const rows = await allocationRowsForKey(admin, input.tenantId, inquiryResourcesPrefix(input.inquiryId), ["hold", "committed"]);
  if (rows === null) return { ok: false, released: 0 };
  const ids = rows.filter((r) => r.order_line_id == null && inWindow(r, input.window)).map((r) => r.id);
  if (ids.length === 0) return { ok: true, released: 0 };
  const res = await releaseCapacity(ids, admin);
  return { ok: res.ok, released: ids.length };
}

export type MoveResourcesResult =
  | { ok: true; moved: boolean; finish: (calendarMoved: boolean) => Promise<void> }
  | { ok: false; reason: "taken" | "unavailable" };

/**
 * Reschedule of a request-sourced booking: hold and commit the SAME pools for the new
 * window first ("taken" refuses the reschedule), then `finish(true)` gives the old window
 * back, or `finish(false)` (the calendar move failed) gives the new one back. Resources on
 * an order line are moved by `reschedule_booking_set` itself and are skipped here.
 * Known limit: a new window overlapping the old one on a 1-unit pool reads as taken
 * (no self-exclusion outside the engine's reschedule).
 */
export async function moveInquiryBookingResources(
  admin: Admin,
  input: { tenantId: string; inquiryId: string; from: BookingWindow; to: BookingWindow; actorUserId?: string | null },
): Promise<MoveResourcesResult> {
  const noop: MoveResourcesResult = { ok: true, moved: false, finish: async () => undefined };
  if (sameInstant(input.from.startsAt, input.to.startsAt) && sameInstant(input.from.endsAt, input.to.endsAt)) return noop;
  const rows = await allocationRowsForKey(admin, input.tenantId, inquiryResourcesPrefix(input.inquiryId), ["hold", "committed"]);
  if (rows === null) return { ok: false, reason: "unavailable" };
  const old = rows.filter((r) => r.order_line_id == null && inWindow(r, input.from));
  if (old.length === 0) return noop;
  const held = await holdBookingResources(admin, {
    tenantId: input.tenantId,
    operationKey: inquiryResourcesKey(input.inquiryId, input.to),
    poolIds: old.map((r) => r.pool_id),
    window: input.to,
    actorUserId: input.actorUserId ?? null,
  });
  if (!held.ok) return { ok: false, reason: held.reason };
  const committed = await commitCapacity(held.allocationIds, null, admin);
  if (!committed.ok) {
    await releaseCapacity(held.allocationIds, admin);
    return { ok: false, reason: "unavailable" };
  }
  return {
    ok: true,
    moved: true,
    finish: async (calendarMoved) => {
      const ids = calendarMoved ? old.map((r) => r.id) : held.allocationIds;
      const res = await releaseCapacity(ids, admin);
      if (!res.ok) logServerError("resources.moveInquiryBookingResources.finish", `inquiry=${input.inquiryId} moved=${calendarMoved}`);
    },
  };
}

/** Offer accepted: the held resources become the booking's (never expire). Key or key prefix. */
export async function commitBookingResources(
  admin: Admin,
  input: { tenantId: string; operationKey: string },
): Promise<{ ok: boolean; committed: number }> {
  const ids = await allocationsForKey(admin, input.tenantId, input.operationKey, ["hold"]);
  if (ids === null) return { ok: false, committed: 0 };
  if (ids.length === 0) return { ok: true, committed: 0 };
  const res = await commitCapacity(ids, null, admin);
  return { ok: res.ok, committed: res.ok ? ids.length : 0 };
}

/**
 * Give resources back (key or key prefix). Held ones by default (request declined, hold cleaned up);
 * `includeCommitted` for a cancelled booking. Idempotent.
 */
export async function releaseBookingResources(
  admin: Admin,
  input: { tenantId: string; operationKey: string; includeCommitted?: boolean },
): Promise<{ ok: boolean; released: number }> {
  const states = input.includeCommitted ? ["hold", "committed"] : ["hold"];
  const ids = await allocationsForKey(admin, input.tenantId, input.operationKey, states);
  if (ids === null) return { ok: false, released: 0 };
  if (ids.length === 0) return { ok: true, released: 0 };
  const res = await releaseCapacity(ids, admin);
  return { ok: res.ok, released: ids.length };
}

/**
 * Request path: hold the linked resources of a service for an inquiry's window. Nothing
 * linked = nothing to do. Used when a request reserves a time.
 */
export async function holdInquiryResources(
  admin: Admin,
  input: {
    tenantId: string;
    inquiryId: string;
    offeringIds: readonly string[];
    window: BookingWindow;
    ttlSeconds?: number | null;
    actorUserId?: string | null;
  },
): Promise<HoldResourcesResult> {
  const linked = await loadLinkedResourcePools(admin, input.tenantId, input.offeringIds);
  if (!linked.ok) return { ok: false, reason: "unavailable", error: linked.error };
  const poolIds = [...linked.poolsByOffering.values()].flat();
  return holdBookingResources(admin, {
    tenantId: input.tenantId,
    operationKey: inquiryResourcesKey(input.inquiryId, input.window),
    poolIds,
    window: input.window,
    ttlSeconds: input.ttlSeconds,
    actorUserId: input.actorUserId,
  });
}

/**
 * Offer acceptance: keep the resources the request held for the agreed window, or hold
 * them now (an offer sent without a held time), then commit them. When the booking has
 * an order, they are committed ONTO its order line, so `cancel_booking_set` and
 * `reschedule_booking_set` release and move them with the booking, scoped to it.
 * Only stale HOLDS of this request are given back: another booking's committed
 * resources on the same request are never touched. "taken" = another booking has one.
 */
export async function secureInquiryBookingResources(
  admin: Admin,
  input: {
    tenantId: string;
    inquiryId: string;
    offeringIds: readonly string[];
    window: BookingWindow;
    orderLineId?: string | null;
    actorUserId?: string | null;
  },
): Promise<"ok" | "taken" | "failed"> {
  const rows = await allocationRowsForKey(admin, input.tenantId, inquiryResourcesPrefix(input.inquiryId), ["hold", "committed"]);
  if (rows === null) return "failed";
  const staleHolds = rows.filter((r) => r.state === "hold" && !inWindow(r, input.window));
  if (staleHolds.length > 0) {
    const res = await releaseCapacity(staleHolds.map((r) => r.id), admin);
    if (!res.ok) return "failed";
  }
  if (!rows.some((r) => inWindow(r, input.window))) {
    const held = await holdInquiryResources(admin, { ...input, ttlSeconds: null });
    if (!held.ok) return held.reason === "taken" ? "taken" : "failed";
  }
  const exact = await allocationsForKey(admin, input.tenantId, inquiryResourcesKey(input.inquiryId, input.window), ["hold"]);
  if (exact === null) return "failed";
  if (exact.length === 0) return "ok";
  const res = await commitCapacity(exact, input.orderLineId ?? null, admin);
  return res.ok ? "ok" : "failed";
}

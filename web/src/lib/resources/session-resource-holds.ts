import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { commitCapacity } from "@/lib/capacity";
import { logServerError } from "@/lib/server/safe-error";
import { reserveResourceSet, spaceCapacityPool } from "./reserve-set";

/**
 * TUL-1413 · A class's room is held ONCE per session, not once per attendee.
 *
 * A group session (class, workshop, tour, clinic) shares its room (or station, bay,
 * studio) among everyone who attends. If every attendee's booking tried to hold the
 * linked resource, the second attendee would be refused even though the room is
 * meant to be shared. So:
 *   - the SESSION holds the linked resources for its window when it is scheduled
 *     (`holdSessionResources`, one engine command, key `session:<id>:resources`);
 *     a second session at the same time in the same room is refused ("taken");
 *   - attendee bookings consume the session's seats only: a line that names a
 *     session never holds the resource itself (`attendeeLinesThatHoldRoom`);
 *   - cancelling the session gives the room back (`releaseSessionResources`).
 *
 * The hold is COMMITTED, not a timed hold: a scheduled session keeps its room until
 * it is cancelled. Fail closed: if the service's rooms cannot be read, a room has no
 * capacity pool, or the engine errors, the session is refused rather than scheduled
 * without its room.
 *
 * Capability, not trade: nothing here names a business. The linked rooms come from
 * the service's own `attributes.resourceSet` (`spaceIds`, or the single `spaceId`).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sessionRoomSpaceIds(attributes: unknown): string[] {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return [];
  const set = (attributes as { resourceSet?: unknown }).resourceSet;
  if (!set || typeof set !== "object" || Array.isArray(set)) return [];
  const rec = set as { spaceIds?: unknown; spaceId?: unknown };
  const out: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === "string" && UUID.test(v.trim()) && !out.includes(v.trim())) out.push(v.trim());
  };
  if (Array.isArray(rec.spaceIds)) rec.spaceIds.forEach(add);
  add(rec.spaceId);
  return out;
}

export function sessionResourceKey(sessionId: string): string {
  return `session:${sessionId}:resources`;
}

/**
 * Attendee purchase lines that must hold the linked resource THEMSELVES: only the
 * ones that do not name a session. A session line shares the room its session holds.
 */
export function attendeeLinesThatHoldRoom<T extends { sessionId?: string | null }>(lines: readonly T[]): T[] {
  return lines.filter((l) => !l.sessionId);
}

export type SessionWindow = { startsAt: string; endsAt: string };

export type SessionHoldDeps = {
  spaceIdsForOffering(tenantId: string, offeringId: string): Promise<{ ok: true; spaceIds: string[] } | { ok: false }>;
  poolForSpace(spaceId: string, tenantId: string): Promise<{ ok: true; poolId: string } | { ok: false }>;
  reserve(input: { tenantId: string; operationKey: string; poolIds: string[]; window: SessionWindow }): Promise<
    { ok: true; allocationIds: string[] } | { ok: false; reason: "taken" | "unavailable" }
  >;
  commit(allocationIds: string[]): Promise<{ ok: boolean }>;
  release(allocationIds: string[]): Promise<{ ok: boolean }>;
  /** Live (held or committed) allocations of a key; null = could not be read. */
  liveAllocationIds(tenantId: string, operationKey: string): Promise<string[] | null>;
};

/**
 * `releaseCapacity` reports ok even when its RPC errored (it is built for best-effort callers).
 * A room that stays held is the failure this file exists to prevent, so release here is strict:
 * an RPC error is a failed release.
 */
async function releaseStrict(admin: SupabaseClient, ids: string[]): Promise<{ ok: boolean }> {
  if (ids.length === 0) return { ok: true };
  try {
    const { error } = await admin.rpc("release_capacity", { p_allocation_ids: [...ids] });
    if (error) {
      logServerError("resources.sessionRoom.release", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    logServerError("resources.sessionRoom.release", err);
    return { ok: false };
  }
}

export function realSessionHoldDeps(admin: SupabaseClient): SessionHoldDeps {
  return {
    async spaceIdsForOffering(tenantId, offeringId) {
      const { data, error } = await admin.from("talent_offerings").select("attributes").eq("tenant_id", tenantId).eq("id", offeringId).maybeSingle();
      if (error) {
        logServerError("resources.sessionRoom.offering", error);
        return { ok: false };
      }
      return { ok: true, spaceIds: sessionRoomSpaceIds((data as { attributes?: unknown } | null)?.attributes) };
    },
    async poolForSpace(spaceId, tenantId) {
      const pool = await spaceCapacityPool(admin, { tenantId, spaceId });
      return pool.ok ? { ok: true, poolId: pool.poolId } : { ok: false };
    },
    async reserve(input) {
      const set = await reserveResourceSet(admin, {
        tenantId: input.tenantId,
        operationKey: input.operationKey,
        capacity: input.poolIds.map((poolId) => ({ poolId, units: 1, startsAt: input.window.startsAt, endsAt: input.window.endsAt })),
      });
      if (set.ok) return { ok: true, allocationIds: set.allocationIds };
      const taken = set.reason === "sold_out" || set.reason === "slot_taken" || set.reason === "ancestor_full";
      return { ok: false, reason: taken ? "taken" : "unavailable" };
    },
    async commit(ids) {
      const r = await commitCapacity(ids, null, admin);
      return { ok: r.ok };
    },
    async release(ids) {
      return releaseStrict(admin, ids);
    },
    async liveAllocationIds(tenantId, operationKey) {
      try {
        const { data, error } = await admin
          .from("capacity_allocations")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("operation_key", operationKey)
          .in("state", ["hold", "committed"]);
        if (error) {
          logServerError("resources.sessionRoom.live", error);
          return null;
        }
        return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
      } catch (err) {
        logServerError("resources.sessionRoom.live", err);
        return null;
      }
    },
  };
}

export type HoldSessionResult = { ok: true; held: number } | { ok: false; reason: "room_taken" | "room_unavailable" };

export async function holdSessionResources(
  input: { admin?: SupabaseClient; tenantId: string; sessionId: string; offeringId: string; window: SessionWindow },
  deps: SessionHoldDeps = realSessionHoldDeps(input.admin as SupabaseClient),
): Promise<HoldSessionResult> {
  const start = Date.parse(input.window.startsAt);
  const end = Date.parse(input.window.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { ok: false, reason: "room_unavailable" };

  const rooms = await deps.spaceIdsForOffering(input.tenantId, input.offeringId);
  if (!rooms.ok) return { ok: false, reason: "room_unavailable" };
  if (rooms.spaceIds.length === 0) return { ok: true, held: 0 };

  const poolIds: string[] = [];
  for (const spaceId of rooms.spaceIds) {
    const pool = await deps.poolForSpace(spaceId, input.tenantId);
    // A linked room that is not set up for booking refuses: scheduling it unheld is the double booking.
    if (!pool.ok) return { ok: false, reason: "room_unavailable" };
    poolIds.push(pool.poolId);
  }

  const key = sessionResourceKey(input.sessionId);
  const held = await deps.reserve({ tenantId: input.tenantId, operationKey: key, poolIds, window: input.window });
  if (!held.ok) return { ok: false, reason: held.reason === "taken" ? "room_taken" : "room_unavailable" };

  const committed = await deps.commit(held.allocationIds);
  if (!committed.ok) {
    await deps.release(held.allocationIds);
    return { ok: false, reason: "room_unavailable" };
  }
  return { ok: true, held: held.allocationIds.length };
}

export async function releaseSessionResources(
  input: { admin?: SupabaseClient; tenantId: string; sessionId: string },
  deps: SessionHoldDeps = realSessionHoldDeps(input.admin as SupabaseClient),
): Promise<{ ok: boolean; released: number }> {
  const ids = await deps.liveAllocationIds(input.tenantId, sessionResourceKey(input.sessionId));
  if (ids === null) return { ok: false, released: 0 };
  if (ids.length === 0) return { ok: true, released: 0 };
  const res = await deps.release(ids);
  return { ok: res.ok, released: res.ok ? ids.length : 0 };
}

/** After a cancel: give the room back for every CANCELLED session among the candidates. */
export async function releaseResourcesOfCancelledSessions(
  input: { admin?: SupabaseClient; tenantId: string; sessions: ReadonlyArray<{ id: string; status: string }> },
  deps: SessionHoldDeps = realSessionHoldDeps(input.admin as SupabaseClient),
): Promise<{ ok: boolean; released: number }> {
  let released = 0;
  let ok = true;
  for (const s of input.sessions) {
    if (s.status !== "cancelled") continue;
    const r = await releaseSessionResources({ tenantId: input.tenantId, sessionId: s.id }, deps);
    released += r.released;
    if (!r.ok) ok = false;
  }
  return { ok, released };
}

/**
 * Safety net for a room held for good: every live session-room allocation whose session is
 * cancelled is released. Cross-tenant (a cron), bounded, idempotent. Fail closed: a read
 * that errors reports `ok: false` and releases nothing.
 */
export async function sweepCancelledSessionRooms(
  admin: SupabaseClient,
  opts: { limit?: number; release?: (ids: string[]) => Promise<{ ok: boolean }> } = {},
): Promise<{ ok: true; released: number } | { ok: false }> {
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 1000);
  try {
    const { data: live, error } = await admin
      .from("capacity_allocations")
      .select("id, operation_key")
      .like("operation_key", "session:%:resources")
      .in("state", ["hold", "committed"])
      .limit(limit);
    if (error) {
      logServerError("resources.sessionRoom.sweep/live", error);
      return { ok: false };
    }
    const bySession = new Map<string, string[]>();
    for (const row of (live ?? []) as Array<{ id: string; operation_key: string }>) {
      const m = /^session:([0-9a-f-]{36}):resources$/i.exec(row.operation_key);
      if (!m) continue;
      bySession.set(m[1], [...(bySession.get(m[1]) ?? []), row.id]);
    }
    if (bySession.size === 0) return { ok: true, released: 0 };
    const { data: sessions, error: sErr } = await admin.from("sessions").select("id, status").in("id", [...bySession.keys()]);
    if (sErr) {
      logServerError("resources.sessionRoom.sweep/sessions", sErr);
      return { ok: false };
    }
    const ids = ((sessions ?? []) as Array<{ id: string; status: string }>)
      .filter((s) => s.status === "cancelled")
      .flatMap((s) => bySession.get(s.id) ?? []);
    if (ids.length === 0) return { ok: true, released: 0 };
    const r = await (opts.release ?? ((x: string[]) => releaseStrict(admin, x)))(ids);
    return r.ok ? { ok: true, released: ids.length } : { ok: false };
  } catch (err) {
    logServerError("resources.sessionRoom.sweep", err);
    return { ok: false };
  }
}

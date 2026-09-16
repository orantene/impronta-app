/**
 * seat_map — the engine seam.
 *
 * The map is assembled the way `loadTicketPicker` assembles its seat list
 * (`event_seat_maps` → `space_layout_items` → `spaces` of kind seat), with
 * the geometry the layouts editor stores. Availability is what
 * `admission_hold_seats` would answer: a seat is `sold` under a converted
 * hold whose order is alive, `held` under a live hold by someone else,
 * `mine` under this guest's live hold, otherwise `free`.
 *
 * Holding goes through `admissionHoldSeats` (RPC, TTL, `operationKey`
 * replay). Releasing is this guest's own live holds only, and it gives the
 * capacity back through `releaseCapacity` exactly as the reaper does.
 */

import type { StorefrontAdmin } from "./admin";
import { mapEngineRefusal } from "./refusals";
import type { StorefrontIdentity } from "./request-context";
import type { SeatMapData, SeatMapInput, SeatMapProps, SeatMapResult, SeatMapSeat, SeatState } from "./seat-map.types";

export const SEAT_HOLD_TTL_SECONDS = 180;

export type SeatMapDeps = {
  admin: StorefrontAdmin;
  identity: StorefrontIdentity;
  /** `guest_sessions.id` for this browser; the admissions engine keys holds on it. */
  guestSessionRowId: string | null;
  locale: "en" | "es";
  now?: () => Date;
  holdSeats: (
    admin: StorefrontAdmin,
    input: { tenantId: string; sessionId: string; seatIds: string[]; guestSessionId?: string | null; ttlSeconds?: number; operationKey: string },
  ) => Promise<{ ok: true; id: string; ids: string[]; expiresAt: string; already: boolean } | { ok: false; reason: string }>;
  releaseCapacity: (allocationIds: readonly string[], admin: StorefrontAdmin) => Promise<{ ok: boolean; released: number; alreadyReleased: number }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SEATS_PER_HOLD = 40;

type HoldRow = {
  id: string;
  seat_space_id: string;
  guest_session_id: string | null;
  status: string;
  expires_at: string;
  order_id: string | null;
  allocation_id: string | null;
};

async function seatStates(
  deps: SeatMapDeps,
  tenantId: string,
  sessionId: string,
  now: Date,
): Promise<{ ok: true; states: Map<string, SeatState>; mine: HoldRow[] } | { ok: false }> {
  const { data, error } = await deps.admin
    .from("admission_holds")
    .select("id, seat_space_id, guest_session_id, status, expires_at, order_id, allocation_id")
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId)
    .in("status", ["held", "converted"]);
  if (error) return { ok: false };
  const holds = (data ?? []) as HoldRow[];
  const orderIds = [...new Set(holds.filter((h) => h.status === "converted" && h.order_id).map((h) => h.order_id as string))];
  const deadOrders = new Set<string>();
  if (orderIds.length > 0) {
    const { data: orders } = await deps.admin.from("orders").select("id, status").in("id", orderIds);
    for (const o of (orders ?? []) as Array<{ id: string; status: string }>) {
      if (o.status === "cancelled" || o.status === "refunded") deadOrders.add(o.id);
    }
  }
  const states = new Map<string, SeatState>();
  const mine: HoldRow[] = [];
  for (const h of holds) {
    if (h.status === "converted") {
      if (h.order_id && deadOrders.has(h.order_id)) continue;
      states.set(h.seat_space_id, "sold");
      continue;
    }
    if (Date.parse(h.expires_at) <= now.getTime()) continue;
    if (states.get(h.seat_space_id) === "sold") continue;
    const isMine = Boolean(deps.guestSessionRowId && h.guest_session_id === deps.guestSessionRowId);
    if (isMine) mine.push(h);
    states.set(h.seat_space_id, isMine ? "mine" : "held");
  }
  return { ok: true, states, mine };
}

export async function readSeatMapCore(
  deps: SeatMapDeps,
  tenantId: string,
  props: SeatMapProps,
): Promise<{ ok: true; data: SeatMapData } | { ok: false; reason: string }> {
  if (!UUID.test(tenantId) || !UUID.test(props.eventId ?? "")) return { ok: false, reason: "invalid_request" };
  const now = (deps.now ?? (() => new Date()))();
  try {
    const { data: event, error: eErr } = await deps.admin
      .from("events")
      .select("id, title, status, venue_id")
      .eq("id", props.eventId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (eErr) return { ok: false, reason: "unavailable" };
    if (!event || event.status !== "published") return { ok: false, reason: "not_sellable" };

    let q = deps.admin
      .from("sessions")
      .select("id, starts_at, ends_at, status, venue_id")
      .eq("tenant_id", tenantId)
      .eq("event_id", props.eventId)
      .eq("status", "scheduled");
    q = props.sessionId ? q.eq("id", props.sessionId) : q.gte("ends_at", now.toISOString());
    const { data: sessions, error: sErr } = await q.order("starts_at", { ascending: true }).limit(1);
    if (sErr) return { ok: false, reason: "unavailable" };
    const session = (sessions ?? [])[0] as { id: string; starts_at: string; ends_at: string; venue_id: string | null } | undefined;
    if (!session) return { ok: false, reason: "not_open" };

    let timezone: string | null = null;
    const venueId = session.venue_id ?? event.venue_id ?? null;
    if (venueId) {
      const { data: venue } = await deps.admin.from("venues").select("id, timezone").eq("id", venueId).maybeSingle();
      if (venue && typeof venue.timezone === "string") timezone = venue.timezone;
    }

    const { data: map, error: mErr } = await deps.admin
      .from("event_seat_maps")
      .select("session_id, layout_id")
      .eq("tenant_id", tenantId)
      .eq("session_id", session.id)
      .maybeSingle();
    if (mErr) return { ok: false, reason: "unavailable" };

    let layout: SeatMapData["layout"] = null;
    const seats: SeatMapSeat[] = [];
    let hold: SeatMapData["hold"] = null;
    if (map?.layout_id) {
      const [{ data: layoutRow }, { data: items, error: iErr }, { data: spaces, error: spErr }, states] = await Promise.all([
        deps.admin.from("space_layouts").select("id, name, canvas").eq("id", map.layout_id).maybeSingle(),
        deps.admin.from("space_layout_items").select("layout_id, space_id, x, y, w, h, rotation, shape").eq("layout_id", map.layout_id),
        deps.admin.from("spaces").select("id, code, name, kind").eq("tenant_id", tenantId).eq("kind", "seat"),
        seatStates(deps, tenantId, session.id, now),
      ]);
      if (iErr || spErr || !states.ok) return { ok: false, reason: "unavailable" };
      const canvas = (layoutRow?.canvas ?? {}) as { w?: number; h?: number };
      layout = layoutRow
        ? { id: String(layoutRow.id), name: String(layoutRow.name ?? ""), canvas: { w: Number(canvas.w ?? 0), h: Number(canvas.h ?? 0) } }
        : null;
      const spaceById = new Map(((spaces ?? []) as Array<{ id: string; code: string | null; name: string | null }>).map((s) => [s.id, s]));
      for (const item of (items ?? []) as Array<Record<string, unknown>>) {
        const space = spaceById.get(String(item.space_id));
        if (!space) continue;
        seats.push({
          id: space.id,
          label: space.code || space.name || space.id,
          x: Number(item.x ?? 0),
          y: Number(item.y ?? 0),
          w: Number(item.w ?? 0),
          h: Number(item.h ?? 0),
          rotation: Number(item.rotation ?? 0),
          shape: typeof item.shape === "string" ? item.shape : null,
          state: states.states.get(space.id) ?? "free",
        });
      }
      if (states.mine.length > 0) {
        hold = {
          ids: states.mine.map((h) => h.id),
          seatIds: states.mine.map((h) => h.seat_space_id),
          expiresAtIso: states.mine.map((h) => h.expires_at).sort()[0] as string,
        };
      }
    }

    return {
      ok: true,
      data: {
        eventId: props.eventId,
        eventTitle: String(event.title ?? ""),
        sessionId: session.id,
        startsAtIso: new Date(session.starts_at).toISOString(),
        endsAtIso: new Date(session.ends_at).toISOString(),
        timezone,
        layout,
        seats,
        hold,
        holdTtlSeconds: SEAT_HOLD_TTL_SECONDS,
      },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function actSeatMapCore(deps: SeatMapDeps, input: SeatMapInput): Promise<SeatMapResult> {
  if (!input || !UUID.test(input.tenantId ?? "")) return mapEngineRefusal("invalid_request", deps.locale);
  const now = (deps.now ?? (() => new Date()))();
  try {
    if (input.op === "hold") {
      const seatIds = Array.isArray(input.seatIds) ? [...new Set(input.seatIds)] : [];
      if (!UUID.test(input.sessionId ?? "") || seatIds.length < 1 || seatIds.length > MAX_SEATS_PER_HOLD || !seatIds.every((s) => UUID.test(s))) {
        return mapEngineRefusal("invalid_request", deps.locale);
      }
      if (typeof input.operationKey !== "string" || input.operationKey.trim().length < 8) {
        return mapEngineRefusal("invalid_request", deps.locale);
      }
      // The engine keys the hold on the guest session; a browser without one
      // cannot own a hold, so it cannot be told "mine" later.
      if (!deps.guestSessionRowId) return mapEngineRefusal("identity_required", deps.locale);
      const { data: session, error } = await deps.admin
        .from("sessions")
        .select("id, event_id, status, ends_at")
        .eq("id", input.sessionId)
        .eq("tenant_id", input.tenantId)
        .maybeSingle();
      if (error) return mapEngineRefusal("unavailable", deps.locale);
      if (!session || session.event_id !== input.eventId) return mapEngineRefusal("not_found", deps.locale);
      if (session.status !== "scheduled") return mapEngineRefusal("not_open", deps.locale);
      if (Date.parse(String(session.ends_at)) <= now.getTime()) return mapEngineRefusal("session_already_ended", deps.locale);
      const held = await deps.holdSeats(deps.admin, {
        tenantId: input.tenantId,
        sessionId: input.sessionId,
        seatIds,
        guestSessionId: deps.guestSessionRowId,
        ttlSeconds: SEAT_HOLD_TTL_SECONDS,
        operationKey: input.operationKey.trim(),
      });
      if (!held.ok) return mapEngineRefusal(held, deps.locale);
      return { ok: true, op: "hold", holdId: held.id, holdIds: held.ids, seatIds, expiresAtIso: held.expiresAt, already: held.already };
    }
    if (input.op === "release") {
      if (!UUID.test(input.sessionId ?? "")) return mapEngineRefusal("invalid_request", deps.locale);
      if (!deps.guestSessionRowId) return { ok: true, op: "release", released: 0 };
      const { data, error } = await deps.admin
        .from("admission_holds")
        .select("id, seat_space_id, guest_session_id, status, expires_at, order_id, allocation_id")
        .eq("tenant_id", input.tenantId)
        .eq("session_id", input.sessionId)
        .eq("guest_session_id", deps.guestSessionRowId)
        .eq("status", "held");
      if (error) return mapEngineRefusal("unavailable", deps.locale);
      const mine = (data ?? []) as HoldRow[];
      if (mine.length === 0) return { ok: true, op: "release", released: 0 };
      const allocations = mine.map((h) => h.allocation_id).filter((a): a is string => !!a);
      if (allocations.length > 0) await deps.releaseCapacity(allocations, deps.admin);
      const { error: uErr } = await deps.admin
        .from("admission_holds")
        .update({ status: "released" })
        .in("id", mine.map((h) => h.id))
        .eq("status", "held");
      if (uErr) return mapEngineRefusal("unavailable", deps.locale);
      return { ok: true, op: "release", released: mine.length };
    }
    return mapEngineRefusal("invalid_request", deps.locale);
  } catch {
    return mapEngineRefusal("engine_error", deps.locale);
  }
}

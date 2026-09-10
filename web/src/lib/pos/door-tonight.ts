import "server-only";

/**
 * door-tonight.ts — the sessions a door can stand at, with admitted against
 * expected against capacity.
 *
 * Admitted and expected come from `admissions` by the SAME rule the events
 * door uses (`doorCounts`): a VIP table for six is one unit of capacity and
 * six people through the door, so a door reading the pool would tell a
 * venue to expect the wrong number. Capacity is the sum of the session's
 * active `session_tier` pools' `units_total`, or null when the session sells
 * nothing, which the screen says in words rather than printing 0.
 *
 * The venue's zone rides along so every time the screen prints is the
 * venue's clock, explicitly.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { doorCounts } from "@/lib/events/summary";
import { logServerError } from "@/lib/server/safe-error";

export type DoorTonightSession = {
  id: string;
  title: string;
  eventId: string;
  startsAt: string;
  endsAt: string;
  /** People through the door so far: `sum(admitted_count)` over every row. */
  admitted: number;
  /** People with a valid, un-no-showed ticket: `doorCounts().expected`. */
  expected: number;
  /** Units the session's tier pools can sell in total, or null when it has no pool. */
  capacity: number | null;
};

export type DoorTonightResult =
  | { ok: true; zone: string; nowIso: string; sessions: DoorTonightSession[] }
  | { ok: false; error: string };

/**
 * Every event session that has not ended (12 hours of grace for a show that
 * runs late) and starts within the next two weeks.
 */
export async function loadDoorTonight(admin: SupabaseClient, tenantId: string): Promise<DoorTonightResult> {
  const now = new Date();
  const from = new Date(now.getTime() - 12 * 60 * 60_000).toISOString();
  const to = new Date(now.getTime() + 14 * 24 * 60 * 60_000).toISOString();

  const [zoneRes, sessionsRes] = await Promise.all([
    admin.from("agencies").select("timezone").eq("id", tenantId).maybeSingle(),
    admin
      .from("sessions")
      .select("id, title, event_id, starts_at, ends_at")
      .eq("tenant_id", tenantId)
      .eq("status", "scheduled")
      .not("event_id", "is", null)
      .gte("ends_at", from)
      .lte("starts_at", to)
      .order("starts_at", { ascending: true })
      .limit(40),
  ]);
  if (zoneRes.error) logServerError("pos.door.tonight/zone", zoneRes.error);
  if (sessionsRes.error) {
    logServerError("pos.door.tonight/sessions", sessionsRes.error);
    return { ok: false, error: "unavailable" };
  }
  const zoneRaw = (zoneRes.data as { timezone?: string | null } | null)?.timezone;
  const zone = typeof zoneRaw === "string" && zoneRaw ? zoneRaw : "UTC";

  const rows = (sessionsRes.data ?? []) as Array<{
    id: string;
    title: string | null;
    event_id: string;
    starts_at: string;
    ends_at: string;
  }>;
  if (rows.length === 0) return { ok: true, zone, nowIso: now.toISOString(), sessions: [] };
  const sessionIds = rows.map((r) => r.id);
  const eventIds = [...new Set(rows.map((r) => r.event_id))];

  const [eventsRes, admissionsRes, poolsRes] = await Promise.all([
    admin.from("events").select("id, title").eq("tenant_id", tenantId).in("id", eventIds),
    admin
      .from("admissions")
      .select("session_id, party_size, admitted_count, status, no_show_at")
      .eq("tenant_id", tenantId)
      .in("session_id", sessionIds),
    admin
      .from("capacity_pools")
      .select("subject_id, units_total, is_active")
      .eq("tenant_id", tenantId)
      .eq("subject_kind", "session_tier")
      .in("subject_id", sessionIds),
  ]);
  if (eventsRes.error) logServerError("pos.door.tonight/events", eventsRes.error);
  if (admissionsRes.error) {
    logServerError("pos.door.tonight/admissions", admissionsRes.error);
    return { ok: false, error: "unavailable" };
  }
  if (poolsRes.error) logServerError("pos.door.tonight/pools", poolsRes.error);

  const titleByEvent = new Map<string, string>();
  for (const e of (eventsRes.data ?? []) as Array<{ id: string; title: string | null }>) {
    if (e.title) titleByEvent.set(e.id, e.title);
  }
  const admissionsBySession = new Map<
    string,
    Array<{ partySize: number; admittedCount: number; status: "valid" | "void" | "refunded"; noShowAt: string | null }>
  >();
  for (const a of (admissionsRes.data ?? []) as Array<{
    session_id: string;
    party_size: number;
    admitted_count: number;
    status: "valid" | "void" | "refunded";
    no_show_at: string | null;
  }>) {
    const list = admissionsBySession.get(a.session_id) ?? [];
    list.push({
      partySize: Number(a.party_size),
      admittedCount: Number(a.admitted_count),
      status: a.status,
      noShowAt: a.no_show_at,
    });
    admissionsBySession.set(a.session_id, list);
  }
  const capacityBySession = new Map<string, number>();
  for (const p of (poolsRes.data ?? []) as Array<{ subject_id: string; units_total: number | string; is_active: boolean }>) {
    if (!p.is_active) continue;
    capacityBySession.set(p.subject_id, (capacityBySession.get(p.subject_id) ?? 0) + Number(p.units_total));
  }

  const sessions: DoorTonightSession[] = rows.map((r) => {
    const admissions = admissionsBySession.get(r.id) ?? [];
    const counts = doorCounts(admissions);
    return {
      id: r.id,
      title: r.title?.trim() || titleByEvent.get(r.event_id) || r.id.slice(0, 8),
      eventId: r.event_id,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
      admitted: counts.arrived,
      expected: counts.expected,
      capacity: capacityBySession.has(r.id) ? (capacityBySession.get(r.id) ?? 0) : null,
    };
  });
  return { ok: true, zone, nowIso: now.toISOString(), sessions };
}

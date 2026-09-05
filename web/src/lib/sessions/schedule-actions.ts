"use server";

/**
 * Schedule surface actions — the read path behind Operate → Schedule.
 *
 * Series, their materialised occurrences, and — the reason this file exists —
 * THE REFUSALS.
 *
 *
 * REFUSALS ARE COMPUTED, NEVER STORED
 * ═══════════════════════════════════
 * The obvious design persists what the nightly sweep refused so a screen can
 * read it back. This calls `decideMaterialisation` — the SAME function the cron
 * calls — against current data, at read time. Three things follow, and the
 * third is the one that matters:
 *
 *   no migration, no table, no band number;
 *   no staleness window where a refusal was fixed but the stored row still
 *   says otherwise — a stored answer that was correct when written and is
 *   wrong when read is indistinguishable from a correct one;
 *   and the surface CANNOT DRIFT FROM THE SWEEP, because it is not a copy of
 *   the sweep's behaviour, it IS the behaviour.
 *
 * A persisted version would have been the third hand-maintained copy of one
 * truth in this area — after the duplicated calendar kind union and the two
 * timezone stores. Those two were forced (a `server-only` boundary; a
 * deliberate record of an agreement). This one is avoidable, so it is avoided.
 *
 *
 * WHY AN OPERATOR NEEDS IT AT ALL
 * ══════════════════════════════
 * The materialiser refuses an occurrence when a daylight-saving shift lands it
 * on an instant another session at the same venue already holds — two sessions
 * at one instant would be two capacity pools selling one room. Until this
 * screen, that refusal existed only in `improntaLog`: an operator whose class
 * silently did not appear had nowhere to look. A refusal a human cannot see is
 * met in the data and not for a person.
 *
 * The same applies to the timezone refusal, which is the commoner one: a series
 * whose venue timezone was never confirmed materialises NOTHING, correctly, and
 * from the Calendar that is indistinguishable from a bug.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import {
  DEFAULT_HORIZON_DAYS,
  decideMaterialisation,
  type ExistingOccurrence,
  type SeriesInput,
  type SkippedOccurrence,
} from "@/lib/sessions/materialise";
import type { IsoWeekday } from "@/lib/sessions/recurrence";
import { improntaLog } from "@/lib/server/structured-log";
import {
  describeSessionRefusal,
  planSession,
} from "@/lib/sessions/session-plan";
import { createSessionWithPools } from "@/lib/sessions/session-writer";

export type ScheduleOccurrence = {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  /** null when the session has no pool — which is itself worth showing. */
  seatsTotal: number | null;
  seatsRemaining: number | null;
};

export type ScheduleSeries = {
  id: string;
  title: string;
  localTime: string;
  timeZone: string | null;
  weekdays: number[];
  durationMinutes: number;
  seats: number;
  startsOn: string;
  endsOn: string | null;
  isActive: boolean;
  venueName: string | null;
  occurrences: ScheduleOccurrence[];
  /**
   * What the sweep would refuse for this series right now. A timezone refusal
   * is series-wide and returns no occurrences at all; a collision refusal names
   * the session it clashed with.
   */
  refusalReason: string | null;
  skipped: SkippedOccurrence[];
};

export type ScheduleResult =
  | { ok: true; series: ScheduleSeries[] }
  | { ok: false; error: string };

function timeToHhmm(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 5) : "";
}

function toWeekdays(value: unknown): IsoWeekday[] {
  if (!Array.isArray(value)) return [];
  const out: IsoWeekday[] = [];
  for (const raw of value) {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 1 && n <= 7) out.push(n as IsoWeekday);
  }
  return out;
}

/**
 * Load the Schedule surface for one workspace.
 *
 * Tenant-scoped in the QUERY, not only by RLS: this runs under the service role
 * so RLS does not apply, and `requireWorkspaceStaffAction` proves the caller is
 * staff of the tenant they asked for. Both predicates, as the Menu actions do —
 * one alone lets a staff member of workspace A read workspace B by passing its
 * id.
 */
export async function loadSchedule(tenantId: string): Promise<ScheduleResult> {
  try {
    const staff = await requireWorkspaceStaffAction();
    if (!staff.ok) return { ok: false, error: staff.error };
    if (staff.tenantId !== tenantId) {
      return { ok: false, error: "Not authorized for this workspace." };
    }

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable." };

    const { data: seriesRows, error: seriesError } = await admin
      .from("session_series")
      .select(
        "id, tenant_id, venue_id, title, local_time, timezone, duration_minutes, weekdays, seats, starts_on, ends_on, is_active",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true });
    if (seriesError) {
      logServerError("sessions.loadSchedule.series", seriesError);
      return { ok: false, error: "Could not load the schedule." };
    }
    const rows = seriesRows ?? [];
    if (rows.length === 0) return { ok: true, series: [] };

    const now = new Date();
    const horizonIso = new Date(now.getTime() + DEFAULT_HORIZON_DAYS * 86_400_000).toISOString();

    const { data: sessionRows, error: sessionError } = await admin
      .from("sessions")
      .select("id, series_id, venue_id, starts_at, ends_at, status")
      .eq("tenant_id", tenantId)
      .gte("starts_at", now.toISOString())
      .lte("starts_at", horizonIso)
      .order("starts_at", { ascending: true });
    if (sessionError) {
      logServerError("sessions.loadSchedule.sessions", sessionError);
      return { ok: false, error: "Could not load the schedule." };
    }
    const sessions = sessionRows ?? [];

    // Pools per session, so an occurrence can show seats AND so `hasPool` is a
    // fact rather than an assumption — a session whose pool creation failed is
    // unsellable and looks identical to one that is fine.
    const sessionIds = sessions.map((s) => String(s.id));
    const poolBySession = new Map<string, { id: string; unitsTotal: number }>();
    if (sessionIds.length > 0) {
      const { data: poolRows, error: poolError } = await admin
        .from("capacity_pools")
        .select("id, subject_id, units_total")
        .eq("tenant_id", tenantId)
        .eq("subject_kind", "session_tier")
        .in("subject_id", sessionIds);
      if (poolError) {
        logServerError("sessions.loadSchedule.pools", poolError);
        return { ok: false, error: "Could not load the schedule." };
      }
      for (const p of poolRows ?? []) {
        poolBySession.set(String(p.subject_id), {
          id: String(p.id),
          unitsTotal: Number(p.units_total),
        });
      }
    }

    const venueIds = [
      ...new Set(rows.map((r) => r.venue_id).filter((v): v is string => typeof v === "string")),
    ];
    const venueNames = new Map<string, string>();
    if (venueIds.length > 0) {
      const { data: venueRows, error: venueError } = await admin
        .from("venues")
        .select("id, name")
        .in("id", venueIds);
      if (venueError) logServerError("sessions.loadSchedule.venues", venueError);
      for (const v of venueRows ?? []) venueNames.set(String(v.id), String(v.name));
    }

    const out: ScheduleSeries[] = [];
    for (const row of rows) {
      const seriesId = String(row.id);
      const mine = sessions.filter((s) => String(s.series_id ?? "") === seriesId);

      // Remaining seats come from the narrow public reader — one integer, never
      // a row, so this surface cannot become a way to enumerate who holds what.
      const occurrences: ScheduleOccurrence[] = [];
      for (const s of mine) {
        const pool = poolBySession.get(String(s.id));
        let remaining: number | null = null;
        if (pool) {
          const { data: rem, error: remError } = await admin.rpc("capacity_remaining_public", {
            p_pool_id: pool.id,
            p_starts_at: String(s.starts_at),
            p_ends_at: String(s.ends_at),
          });
          if (remError) logServerError("sessions.loadSchedule.remaining", remError);
          else if (typeof rem === "number") remaining = rem;
        }
        occurrences.push({
          id: String(s.id),
          startsAt: String(s.starts_at),
          endsAt: String(s.ends_at),
          status: String(s.status),
          seatsTotal: pool ? pool.unitsTotal : null,
          seatsRemaining: remaining,
        });
      }

      const series: SeriesInput = {
        id: seriesId,
        tenantId,
        title: String(row.title ?? ""),
        localTime: timeToHhmm(row.local_time),
        timeZone: typeof row.timezone === "string" ? row.timezone : null,
        weekdays: toWeekdays(row.weekdays),
        durationMinutes: Number(row.duration_minutes),
        startsOn: String(row.starts_on),
        endsOn: typeof row.ends_on === "string" ? row.ends_on : null,
        seats: Number(row.seats),
        isActive: row.is_active === true,
      };

      const existing: ExistingOccurrence[] = mine.map((s) => ({
        id: String(s.id),
        startsAt: String(s.starts_at),
        hasPool: poolBySession.has(String(s.id)),
      }));

      const venueOccupancy = row.venue_id
        ? sessions
            .filter(
              (s) =>
                String(s.venue_id ?? "") === String(row.venue_id) &&
                String(s.series_id ?? "") !== seriesId &&
                String(s.status) === "scheduled",
            )
            .map((s) => ({
              sessionId: String(s.id),
              startsAt: String(s.starts_at),
              title:
                rows.find((r) => String(r.id) === String(s.series_id))?.title
                  ? String(rows.find((r) => String(r.id) === String(s.series_id))!.title)
                  : null,
            }))
        : [];

      // THE SAME CALL THE CRON MAKES. Not a description of it.
      const decision = decideMaterialisation(
        series,
        existing,
        now,
        DEFAULT_HORIZON_DAYS,
        venueOccupancy,
      );

      out.push({
        id: seriesId,
        title: series.title,
        localTime: series.localTime,
        timeZone: series.timeZone,
        weekdays: [...series.weekdays],
        durationMinutes: series.durationMinutes,
        seats: series.seats,
        startsOn: series.startsOn,
        endsOn: series.endsOn ?? null,
        isActive: series.isActive,
        venueName: row.venue_id ? venueNames.get(String(row.venue_id)) ?? null : null,
        occurrences,
        refusalReason: decision.ok ? null : decision.reason,
        skipped: decision.ok ? decision.skipped : [],
      });
    }

    return { ok: true, series: out };
  } catch (error) {
    logServerError("sessions.loadSchedule", error);
    return { ok: false, error: "Could not load the schedule." };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE WRITE PATH — scheduling a night, which until now nothing could do.
 *
 * The cron materialises `session_series` forward 90 days and creates each
 * session's capacity pool with it. What did not exist was any way for a HUMAN
 * to produce either input: `session_series` was only ever SELECTed in this
 * repository, so the sweep faithfully materialised series that nothing could
 * create. An engine with no door.
 *
 * This is the door for the one-off case: an admin schedules a night, optionally
 * against an event, and gives seats per tier for THAT night.
 *
 * Seats are per-night input, not a property of the tier. The same "VIP table"
 * tier is six tables one night and four the next, so the number belongs to the
 * night. A tier is not a table.
 * ═══════════════════════════════════════════════════════════════════════════ */

export type EventTierOption = {
  poolKey: string;
  label: string;
  amountCents: number;
};

export type ScheduleEventOption = {
  id: string;
  title: string;
  tiers: EventTierOption[];
};

export type ScheduleSessionInput = {
  tenantId: string;
  startsAt: string;
  endsAt: string;
  eventId?: string | null;
  venueId?: string | null;
  title?: string | null;
  /** Seats per tier pool_key for this night. */
  tiers: Array<{ poolKey: string; units: number }>;
};

export type ScheduleSessionResult =
  | { ok: true; sessionId: string; poolsCreated: number }
  | { ok: false; message: string };

/**
 * The events an admin can schedule a night against, with their tiers.
 *
 * Tiers without a `pool_key` are omitted rather than defaulted: a variant with
 * no pool key is not a tier, and inventing one here would mint a key that
 * Events' writer does not know about and nothing would ever resolve.
 */
export async function loadSchedulableEvents(
  tenantId: string,
): Promise<{ ok: true; events: ScheduleEventOption[] } | { ok: false; message: string }> {
  try {
    const staff = await requireWorkspaceStaffAction();
    if (!staff.ok || staff.tenantId !== tenantId) {
      return { ok: false, message: "Not authorized for this workspace." };
    }
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, message: "Service unavailable." };

    const { data: eventRows, error: eventError } = await admin
      .from("events")
      .select("id, title, offering_id")
      .eq("tenant_id", tenantId)
      .order("title", { ascending: true })
      .limit(200);
    if (eventError) {
      logServerError("sessions.loadSchedulableEvents.events", eventError);
      return { ok: false, message: "Could not load events." };
    }

    const offeringIds = (eventRows ?? [])
      .map((row) => row.offering_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    const tiersByOffering = new Map<string, EventTierOption[]>();
    if (offeringIds.length > 0) {
      const { data: variantRows, error: variantError } = await admin
        .from("talent_offering_variants")
        .select("offering_id, label, pool_key, amount_cents")
        .in("offering_id", offeringIds);
      if (variantError) {
        // A wrong tier list would let an operator give seats to a tier that is
        // not there, so this refuses rather than showing events with no tiers.
        logServerError("sessions.loadSchedulableEvents.variants", variantError);
        return { ok: false, message: "Could not load ticket tiers." };
      }
      for (const row of variantRows ?? []) {
        const poolKey = typeof row.pool_key === "string" ? row.pool_key.trim() : "";
        if (!poolKey) continue;
        const offeringId = String(row.offering_id);
        const list = tiersByOffering.get(offeringId) ?? [];
        list.push({
          poolKey,
          label: typeof row.label === "string" ? row.label : poolKey,
          amountCents: Number(row.amount_cents ?? 0),
        });
        tiersByOffering.set(offeringId, list);
      }
    }

    return {
      ok: true,
      events: (eventRows ?? []).map((row) => ({
        id: String(row.id),
        title: typeof row.title === "string" ? row.title : "Untitled event",
        tiers: row.offering_id ? (tiersByOffering.get(String(row.offering_id)) ?? []) : [],
      })),
    };
  } catch (err) {
    logServerError("sessions.loadSchedulableEvents", err);
    return { ok: false, message: "Could not load events." };
  }
}

/**
 * Schedule one night and create its pools.
 *
 * The tier keys are re-read from the database here rather than trusted from the
 * form: a client that posts `{poolKey: "vip", units: 500}` for an event with no
 * VIP tier would otherwise create a real pool that nothing resolves. The plan
 * refuses an unknown key, and the known set has to come from the server for
 * that refusal to mean anything.
 */
export async function scheduleSession(
  input: ScheduleSessionInput,
): Promise<ScheduleSessionResult> {
  try {
    const staff = await requireWorkspaceStaffAction();
    if (!staff.ok || staff.tenantId !== input.tenantId) {
      return { ok: false, message: "Not authorized for this workspace." };
    }
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, message: "Service unavailable." };

    let knownPoolKeys: string[] = [];
    let offeringId: string | null = null;
    let venueId: string | null = input.venueId ?? null;

    if (input.eventId) {
      const { data: event, error: eventError } = await admin
        .from("events")
        .select("id, offering_id, venue_id")
        .eq("id", input.eventId)
        .eq("tenant_id", input.tenantId)
        .maybeSingle();
      if (eventError) {
        logServerError("sessions.scheduleSession.event", eventError);
        return { ok: false, message: "Could not read the event." };
      }
      // Same answer as a genuinely missing event: a staff member in one
      // workspace learns nothing about ids in another.
      if (!event) return { ok: false, message: "That event was not found." };

      offeringId = event.offering_id ? String(event.offering_id) : null;
      venueId = venueId ?? (event.venue_id ? String(event.venue_id) : null);

      if (offeringId) {
        const { data: variants, error: variantError } = await admin
          .from("talent_offering_variants")
          .select("pool_key")
          .eq("offering_id", offeringId);
        if (variantError) {
          logServerError("sessions.scheduleSession.variants", variantError);
          return { ok: false, message: "Could not read the event's ticket tiers." };
        }
        knownPoolKeys = (variants ?? [])
          .map((row) => (typeof row.pool_key === "string" ? row.pool_key.trim() : ""))
          .filter((key) => key.length > 0);
      }
    }

    const plan = planSession({
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      tiers: input.tiers,
      knownPoolKeys,
    });
    if (!plan.ok) return { ok: false, message: describeSessionRefusal(plan) };

    const result = await createSessionWithPools(
      admin,
      {
        tenantId: input.tenantId,
        eventId: input.eventId ?? null,
        venueId,
        offeringId,
        title: input.title?.trim() || null,
        startsAt: plan.startsAt,
        endsAt: plan.endsAt,
      },
      plan.pools,
    );

    if (!result.ok && result.reason === "duplicate_occurrence") {
      return { ok: false, message: "A session already exists at that time." };
    }
    if (!result.ok && result.reason === "insert_failed") {
      return { ok: false, message: "Could not create the session." };
    }
    if (!result.ok) {
      // The session exists but not all of its pools do. Said plainly, with the
      // count, because a tier with no pool is unsellable for this night and
      // silence here is exactly the failure the plan refuses to create.
      return {
        ok: false,
        message: `The session was created, but only ${result.poolsCreated} of ${plan.pools.length} tiers got seats. Open the session and add the missing tiers before selling.`,
      };
    }

    void improntaLog("sessions.scheduled", {
      tenantId: input.tenantId,
      sessionId: result.sessionId,
      eventId: input.eventId ?? null,
      pools: result.poolsCreated,
    });

    return { ok: true, sessionId: result.sessionId, poolsCreated: result.poolsCreated };
  } catch (err) {
    logServerError("sessions.scheduleSession", err);
    return { ok: false, message: "Could not create the session." };
  }
}

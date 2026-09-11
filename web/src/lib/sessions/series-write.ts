import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import {
  decideMaterialisation,
  type ExistingOccurrence,
  type SeriesInput,
  type VenueOccupancy,
} from "./materialise";
import { createSessionWithPools } from "./session-writer";
import type { IsoWeekday } from "./recurrence";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rpc?: (fn: string, args: Record<string, unknown>) => any;
};

export type SeriesWriteReason =
  | "overlapping_room"
  | "no_instructor"
  | "past"
  | "invalid"
  | "conflict"
  | "not_found"
  | "wrong_tenant"
  | "unavailable";

export type UpsertSeriesResult =
  | { ok: true; seriesId: string }
  | { ok: false; reason: SeriesWriteReason };

export type GenerateSeriesResult =
  | { ok: true; created: number; reused: number }
  | { ok: false; reason: SeriesWriteReason };

/** Inclusive-exclusive windows compared as ISO instants. */
export function sessionWindowsOverlap(
  aStartsAt: string,
  aEndsAt: string,
  bStartsAt: string,
  bEndsAt: string,
): boolean {
  return aStartsAt < bEndsAt && aEndsAt > bStartsAt;
}

function asWeekdays(raw: unknown): IsoWeekday[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 7) return null;
  const out: IsoWeekday[] = [];
  for (const n of raw) {
    if (![1, 2, 3, 4, 5, 6, 7].includes(Number(n))) return null;
    out.push(Number(n) as IsoWeekday);
  }
  return out;
}

export async function upsertSessionSeries(
  admin: Admin,
  input: {
    tenantId: string;
    seriesId?: string | null;
    title: string;
    localTime: string;
    timeZone: string;
    weekdays: number[];
    durationMinutes: number;
    seats: number;
    startsOn: string;
    endsOn?: string | null;
    venueId: string;
    offeringId?: string | null;
    instructorUserId: string;
    isActive?: boolean;
  },
): Promise<UpsertSeriesResult> {
  const title = input.title.trim();
  const timeZone = input.timeZone.trim();
  const weekdays = asWeekdays(input.weekdays);
  if (!title || !timeZone || !weekdays) return { ok: false, reason: "invalid" };
  if (!input.instructorUserId) return { ok: false, reason: "no_instructor" };
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(input.localTime.trim())) return { ok: false, reason: "invalid" };
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 1440) {
    return { ok: false, reason: "invalid" };
  }
  if (!Number.isInteger(input.seats) || input.seats < 0) return { ok: false, reason: "invalid" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startsOn)) return { ok: false, reason: "invalid" };
  if (input.endsOn && input.endsOn < input.startsOn) return { ok: false, reason: "past" };

  const localTime = input.localTime.trim().length === 5 ? `${input.localTime.trim()}:00` : input.localTime.trim();
  if (input.venueId) {
    const clash = await refuseVenueOverlap(admin, {
      tenantId: input.tenantId,
      seriesId: input.seriesId ?? null,
      title,
      localTime: localTime.slice(0, 5),
      timeZone,
      weekdays,
      durationMinutes: input.durationMinutes,
      startsOn: input.startsOn,
      endsOn: input.endsOn ?? null,
      seats: input.seats,
      venueId: input.venueId,
      isActive: input.isActive !== false,
    });
    if (!clash.ok) return clash;
  }
  const row = {
    tenant_id: input.tenantId,
    title,
    local_time: localTime,
    timezone: timeZone,
    weekdays,
    duration_minutes: input.durationMinutes,
    seats: input.seats,
    starts_on: input.startsOn,
    ends_on: input.endsOn ?? null,
    venue_id: input.venueId,
    offering_id: input.offeringId ?? null,
    instructor_user_id: input.instructorUserId,
    is_active: input.isActive !== false,
  };

  if (input.seriesId) {
    const { data, error } = await admin
      .from("session_series")
      .update(row)
      .eq("id", input.seriesId)
      .eq("tenant_id", input.tenantId)
      .select("id")
      .maybeSingle();
    if (error) {
      logServerError("sessions.upsertSessionSeries.update", error);
      return { ok: false, reason: "unavailable" };
    }
    if (!data) return { ok: false, reason: "not_found" };
    return { ok: true, seriesId: String((data as { id: string }).id) };
  }

  const { data, error } = await admin.from("session_series").insert(row).select("id").maybeSingle();
  if (error) {
    logServerError("sessions.upsertSessionSeries.insert", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "unavailable" };
  return { ok: true, seriesId: String((data as { id: string }).id) };
}

export async function generateSessionsForSeries(
  admin: Admin,
  input: { tenantId: string; seriesId: string; untilDate: string; now?: Date },
): Promise<GenerateSeriesResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.untilDate)) return { ok: false, reason: "invalid" };
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  if (input.untilDate < today) return { ok: false, reason: "past" };

  const { data: series, error } = await admin
    .from("session_series")
    .select(
      "id, tenant_id, title, local_time, timezone, weekdays, duration_minutes, seats, starts_on, ends_on, venue_id, offering_id, instructor_user_id, is_active",
    )
    .eq("id", input.seriesId)
    .maybeSingle();
  if (error) {
    logServerError("sessions.generateSessions.load", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!series) return { ok: false, reason: "not_found" };
  const s = series as {
    tenant_id: string;
    title: string;
    local_time: string;
    timezone: string | null;
    weekdays: number[];
    duration_minutes: number;
    seats: number;
    starts_on: string;
    ends_on: string | null;
    venue_id: string | null;
    offering_id: string | null;
    instructor_user_id: string | null;
    is_active: boolean;
  };
  if (s.tenant_id !== input.tenantId) return { ok: false, reason: "wrong_tenant" };
  if (!s.instructor_user_id) return { ok: false, reason: "no_instructor" };

  const untilMs = Date.parse(`${input.untilDate}T23:59:59.000Z`);
  const horizonDays = Math.max(1, Math.ceil((untilMs - now.getTime()) / 86_400_000));

  const { data: existingRows, error: exErr } = await admin
    .from("sessions")
    .select("id, starts_at, series_id")
    .eq("tenant_id", input.tenantId)
    .eq("series_id", input.seriesId);
  if (exErr) {
    logServerError("sessions.generateSessions.existing", exErr);
    return { ok: false, reason: "unavailable" };
  }

  const existing: ExistingOccurrence[] = ((existingRows ?? []) as Array<{ id: string; starts_at: string }>).map(
    (row) => ({ id: row.id, startsAt: row.starts_at, hasPool: true }),
  );

  let venueOccupancy: VenueOccupancy = [];
  let venueWindows: Array<{ startsAt: string; endsAt: string }> = [];
  if (s.venue_id) {
    const { data: others, error: oErr } = await admin
      .from("sessions")
      .select("id, starts_at, ends_at, title, series_id, status")
      .eq("tenant_id", input.tenantId)
      .eq("venue_id", s.venue_id)
      .eq("status", "scheduled");
    if (oErr) {
      logServerError("sessions.generateSessions.venue", oErr);
      return { ok: false, reason: "unavailable" };
    }
    const foreign = ((others ?? []) as Array<{
      id: string;
      starts_at: string;
      ends_at: string | null;
      title: string | null;
      series_id: string | null;
    }>).filter((row) => row.series_id !== input.seriesId);
    venueOccupancy = foreign.map((row) => ({ sessionId: row.id, startsAt: row.starts_at, title: row.title }));
    venueWindows = foreign.map((row) => ({ startsAt: row.starts_at, endsAt: row.ends_at ?? row.starts_at }));
  }

  const shaped: SeriesInput = {
    id: input.seriesId,
    tenantId: input.tenantId,
    title: s.title,
    localTime: String(s.local_time).slice(0, 5),
    timeZone: s.timezone,
    weekdays: (asWeekdays(s.weekdays) ?? []) as IsoWeekday[],
    durationMinutes: s.duration_minutes,
    startsOn: s.starts_on,
    endsOn: s.ends_on,
    seats: s.seats,
    isActive: s.is_active,
  };

  const decision = decideMaterialisation(shaped, existing, now, horizonDays, venueOccupancy);
  if (!decision.ok) {
    if (decision.reason === "series_inactive") return { ok: false, reason: "invalid" };
    return { ok: false, reason: "invalid" };
  }
  if (decision.skipped.length > 0) return { ok: false, reason: "overlapping_room" };
  for (const occ of decision.create) {
    if (venueWindows.some((w) => sessionWindowsOverlap(occ.startsAt, occ.endsAt, w.startsAt, w.endsAt))) {
      return { ok: false, reason: "overlapping_room" };
    }
  }

  let created = 0;
  let reused = decision.existing;
  for (const occ of decision.create) {
    const made = await createSessionWithPools(
      admin as never,
      {
        tenantId: input.tenantId,
        startsAt: occ.startsAt,
        endsAt: occ.endsAt,
        seriesId: input.seriesId,
        venueId: s.venue_id,
        offeringId: s.offering_id,
        title: s.title,
        instructorUserId: s.instructor_user_id,
      },
      [{ poolKey: "default", units: s.seats }],
    );
    if (!made.ok) return { ok: false, reason: "unavailable" };
    if (made.created) created += 1;
    else reused += 1;
  }
  return { ok: true, created, reused };
}

async function refuseVenueOverlap(
  admin: Admin,
  input: {
    tenantId: string;
    seriesId: string | null;
    title: string;
    localTime: string;
    timeZone: string;
    weekdays: IsoWeekday[];
    durationMinutes: number;
    startsOn: string;
    endsOn: string | null;
    seats: number;
    venueId: string;
    isActive: boolean;
  },
): Promise<{ ok: true } | { ok: false; reason: SeriesWriteReason }> {
  const now = new Date();
  const until = input.endsOn ?? input.startsOn;
  const untilMs = Date.parse(`${until}T23:59:59.000Z`);
  const horizonDays = Math.max(1, Math.ceil((untilMs - now.getTime()) / 86_400_000) + 1);
  const { data: others, error } = await admin
    .from("sessions")
    .select("id, starts_at, ends_at, title, series_id")
    .eq("tenant_id", input.tenantId)
    .eq("venue_id", input.venueId)
    .eq("status", "scheduled");
  if (error) {
    logServerError("sessions.upsertSessionSeries.venue", error);
    return { ok: false, reason: "unavailable" };
  }
  const foreign = ((others ?? []) as Array<{
    id: string;
    starts_at: string;
    ends_at: string | null;
    title: string | null;
    series_id: string | null;
  }>).filter((row) => row.series_id !== input.seriesId);
  const occupancy: VenueOccupancy = foreign.map((row) => ({
    sessionId: row.id,
    startsAt: row.starts_at,
    title: row.title,
  }));
  const shaped: SeriesInput = {
    id: input.seriesId ?? "preview",
    tenantId: input.tenantId,
    title: input.title,
    localTime: input.localTime,
    timeZone: input.timeZone,
    weekdays: input.weekdays,
    durationMinutes: input.durationMinutes,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    seats: input.seats,
    isActive: input.isActive,
  };
  const decision = decideMaterialisation(shaped, [], now, horizonDays, occupancy);
  if (!decision.ok) return { ok: true };
  if (decision.skipped.length > 0) return { ok: false, reason: "overlapping_room" };
  for (const occ of decision.create) {
    if (
      foreign.some((row) =>
        sessionWindowsOverlap(occ.startsAt, occ.endsAt, row.starts_at, row.ends_at ?? row.starts_at),
      )
    ) {
      return { ok: false, reason: "overlapping_room" };
    }
  }
  return { ok: true };
}

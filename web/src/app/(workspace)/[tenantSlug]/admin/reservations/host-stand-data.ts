import "server-only";

/**
 * What the host stand reads. One query per thing it shows, and no more.
 *
 * The DECISIONS are all in `lib/reservations/book.ts` and tested there; this
 * file only fetches. Keeping them apart is what let the six states, the two
 * covers numbers and the late/no-show ordering be argued and re-argued without
 * a database.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadDefaultVenue, resolveTenantTimezone } from "@/lib/spaces/venues";
import { loadVenueServiceConfig } from "@/lib/reservations/store";
import { buildBook, resolveWindowOnDate, summariseBook } from "@/lib/reservations";
import type { BookEntry, BookRow, ResolvedWindow, ServiceRules } from "@/lib/reservations";

export type HostStandData = {
  venueName: string;
  timeZone: string;
  rules: ServiceRules;
  /** Windows resolved onto the requested day, earliest first. */
  windows: ResolvedWindow[];
  entries: BookEntry[];
  summary: ReturnType<typeof summariseBook>;
};

export type HostStandState =
  | { kind: "ok"; data: HostStandData }
  | { kind: "no_venue" }
  | { kind: "not_configured"; venueName: string }
  /** A READ FAILED. Deliberately not the same as an empty book. */
  | { kind: "unavailable" };

type AdmissionRow = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function int(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toBookRow(row: AdmissionRow, spaceCodes: Map<string, string>): BookRow | null {
  const id = str(row.id);
  const startsAt = str(row.starts_at);
  if (!id || !startsAt) return null;
  const at = new Date(startsAt);
  if (Number.isNaN(at.getTime())) return null;

  const spaceId = str(row.space_id);
  const status = row.status === "void" || row.status === "refunded" ? row.status : "valid";

  return {
    admissionId: id,
    startsAt: at,
    partySize: Math.max(1, int(row.party_size, 1)),
    admittedCount: Math.max(0, int(row.admitted_count, 0)),
    noShowAt: str(row.no_show_at) ? new Date(str(row.no_show_at)!) : null,
    completedAt: str(row.completed_at) ? new Date(str(row.completed_at)!) : null,
    status,
    holderName: str(row.holder_name),
    // Unassigned is a valid state, so a missing code is null and never a dash
    // or an empty string pretending to be a table.
    spaceCode: spaceId ? (spaceCodes.get(spaceId) ?? null) : null,
  };
}

/**
 * Today's book for a venue, on a given local date.
 *
 * A FAILED READ IS NOT AN EMPTY BOOK. `unavailable` and "nobody is booked
 * tonight" look identical on a screen and mean opposite things to a host, so
 * they are different states and the page says different words for them.
 */
export async function loadHostStand(
  tenantId: string,
  onDate: string,
  now: Date,
): Promise<HostStandState> {
  const sb = createServiceRoleClient();
  if (!sb) return { kind: "unavailable" };

  try {
    const venue = await loadDefaultVenue(tenantId);
    if (!venue) return { kind: "no_venue" };

    const config = await loadVenueServiceConfig(tenantId, venue.id, {
      fromDate: onDate,
      toDate: onDate,
    });
    if (!config) return { kind: "unavailable" };
    if (!config.rules.isActive || config.windows.length === 0) {
      return { kind: "not_configured", venueName: venue.name };
    }

    const tz = await resolveTenantTimezone(tenantId, venue.id);
    const timeZone = tz?.timezone ?? venue.timezone;

    const windows: ResolvedWindow[] = [];
    for (const w of config.windows) {
      const r = resolveWindowOnDate({
        window: w,
        exceptions: config.exceptions,
        onDate,
        timeZone,
        defaultTurnMinutes: config.rules.defaultTurnMinutes,
      });
      if (r.ok) windows.push(r.window);
    }
    windows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    // The day's span, from the earliest window's start to the latest one's end.
    // Taken from resolved INSTANTS rather than from the date string, so a
    // service crossing midnight is one evening and not two half ones.
    const dayStart = windows[0]?.startsAt ?? new Date(`${onDate}T00:00:00Z`);
    const dayEnd =
      windows.length > 0
        ? new Date(Math.max(...windows.map((w) => w.endsAt.getTime())))
        : new Date(dayStart.getTime() + 24 * 3_600_000);

    const { data: rows, error } = await sb
      .from("admissions")
      .select(
        "id, starts_at, party_size, admitted_count, no_show_at, completed_at, status, holder_name, space_id",
      )
      .eq("tenant_id", tenantId)
      .gte("starts_at", dayStart.toISOString())
      .lt("starts_at", dayEnd.toISOString())
      .order("starts_at", { ascending: true });

    if (error) {
      logServerError("reservations.loadHostStand/admissions", error);
      return { kind: "unavailable" };
    }

    const spaceIds = Array.from(
      new Set((rows ?? []).map((r) => str(r.space_id)).filter((s): s is string => s !== null)),
    );
    const spaceCodes = new Map<string, string>();
    if (spaceIds.length > 0) {
      const { data: spaces, error: spaceError } = await sb
        .from("spaces")
        .select("id, code, name")
        .eq("tenant_id", tenantId)
        .in("id", spaceIds);
      if (spaceError) {
        // A table label we cannot read is not a reason to hide the book. The
        // host still needs the list; the row shows unassigned, which is honest
        // rather than wrong.
        logServerError("reservations.loadHostStand/spaces", spaceError);
      }
      for (const s of spaces ?? []) {
        const id = str(s.id);
        const label = str(s.code) ?? str(s.name);
        if (id && label) spaceCodes.set(id, label);
      }
    }

    const bookRows = (rows ?? [])
      .map((r) => toBookRow(r, spaceCodes))
      .filter((r): r is BookRow => r !== null);

    const entries = buildBook(bookRows, now, config.rules.noShowGraceMinutes);

    return {
      kind: "ok",
      data: {
        venueName: venue.name,
        timeZone,
        rules: config.rules,
        windows,
        entries,
        summary: summariseBook(entries),
      },
    };
  } catch (err) {
    logServerError("reservations.loadHostStand", err);
    return { kind: "unavailable" };
  }
}

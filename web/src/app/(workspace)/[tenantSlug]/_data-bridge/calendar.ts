import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import { utcToZonedYmd } from "@/lib/scheduling/tz";

/**
 * _data-bridge/calendar.ts — calendar page data loader.
 *
 * Unions inquiries (event_date), timed agency_bookings, and firm talent_holds.
 * Empty array stays blank (no RICH_INQUIRIES mock).
 */

export type CalendarEventKind = "inquiry" | "booking" | "hold" | "order" | "session";

export type CalendarEvent = {
  id: string;
  contact_name: string;
  company: string | null;
  event_date: string; // ISO date string "YYYY-MM-DD"
  status: string;
  starts_at?: string | null;
  ends_at?: string | null;
  timezone?: string | null;
  kind?: CalendarEventKind;
};

function ymdFromInstant(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The LOCAL day an instant falls on, for a row that knows its zone.
 *
 * `ymdFromInstant` above takes the UTC date by slicing the string, which is
 * wrong for any row whose zone is not UTC and wrong *silently*: a 20:00 class in
 * Cancun is 01:00 UTC the NEXT day, so it lands on tomorrow's column; a 01:00
 * show in Madrid is 23:00 UTC the previous day and lands on yesterday's. The
 * error is invisible except at the edges of a day, which is exactly where a
 * late class or an early show lives.
 *
 * Every timed row goes through this now: sessions and bookings/orders carry a
 * zone (venue for sessions, `agency_bookings.timezone` for bookings), so they
 * get the honest local day; holds carry no zone and fall back to the UTC slice
 * until they do. Inquiries are exempt — `inquiries.event_date` is a plain DATE
 * column (a user-entered calendar date, no instant), so it has no zone to
 * localize and its slice is a no-op, not a bug.
 */
function localYmd(iso: string, timeZone: string | null): string {
  if (!timeZone) return ymdFromInstant(iso);
  return utcToZonedYmd(new Date(iso), timeZone) ?? ymdFromInstant(iso);
}

/**
 * Load calendar rows for the workspace: dated inquiries, timed bookings,
 * and unexpired firm holds. Dedupes an inquiry when a booking or hold
 * already carries that inquiry's time.
 */
export async function loadCalendarEvents(
  tenantId: string,
): Promise<CalendarEvent[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const nowIso = new Date().toISOString();

    const [inqRes, bookRes, holdRes, sessionRes] = await Promise.all([
      supabase
        .from("inquiries")
        .select("id, contact_name, company, event_date, status")
        .eq("tenant_id", tenantId)
        .not("event_date", "is", null)
        .order("event_date", { ascending: true })
        .limit(500),
      supabase
        .from("agency_bookings")
        .select(
          "id, source_inquiry_id, title, starts_at, ends_at, timezone, status, event_date, calendar_lane",
        )
        .eq("tenant_id", tenantId)
        .not("starts_at", "is", null)
        .limit(500),
      supabase
        .from("talent_holds")
        .select("id, inquiry_id, title, starts_at, ends_at, expires_at, hold_strength")
        .eq("tenant_id", tenantId)
        .eq("hold_strength", "firm")
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .limit(500),
      // Sessions & Classes P1.3. Scheduled occurrences only: a cancelled session
      // is history and does not belong on a forward-looking calendar.
      supabase
        .from("sessions")
        .select("id, title, starts_at, ends_at, status, venue_id, series_id")
        .eq("tenant_id", tenantId)
        .eq("status", "scheduled")
        .gte("starts_at", nowIso)
        .order("starts_at", { ascending: true })
        .limit(500),
    ]);

    if (inqRes.error) logServerError("workspace.loadCalendarEvents.inquiries", inqRes.error);
    if (bookRes.error) logServerError("workspace.loadCalendarEvents.bookings", bookRes.error);
    if (holdRes.error) logServerError("workspace.loadCalendarEvents.holds", holdRes.error);
    if (sessionRes.error) logServerError("workspace.loadCalendarEvents.sessions", sessionRes.error);

    const out: CalendarEvent[] = [];
    const coveredInquiryIds = new Set<string>();

    for (const row of (bookRes.data ?? []) as Array<{
      id: string;
      source_inquiry_id: string | null;
      title: string | null;
      starts_at: string;
      ends_at: string | null;
      timezone: string | null;
      status: string;
      event_date: string | null;
      calendar_lane: string | null;
    }>) {
      if (row.source_inquiry_id) coveredInquiryIds.add(row.source_inquiry_id);
      const isOrder = row.calendar_lane === "order";
      out.push({
        id: row.source_inquiry_id ?? row.id,
        contact_name: row.title?.trim() || (isOrder ? "Order" : "Booking"),
        company: null,
        // The LOCAL day, not the UTC slice. A booking/order carries its own
        // zone, so a 20:00 booking in Cancun (01:00Z next day) stays on today.
        event_date: localYmd(row.starts_at, row.timezone),
        status: row.status || "booked",
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        timezone: row.timezone,
        kind: isOrder ? "order" : "booking",
      });
    }

    for (const row of (holdRes.data ?? []) as Array<{
      id: string;
      inquiry_id: string | null;
      title: string | null;
      starts_at: string;
      ends_at: string;
      expires_at: string | null;
    }>) {
      if (row.inquiry_id) coveredInquiryIds.add(row.inquiry_id);
      out.push({
        id: row.inquiry_id ?? row.id,
        contact_name: row.title?.trim() || "Hold",
        company: null,
        // Holds carry no zone of their own, so localYmd falls back to the UTC
        // slice — routed through it anyway so every row uses one mechanism and
        // a hold gains the local day for free if it ever carries a zone.
        event_date: localYmd(row.starts_at, null),
        status: "submitted",
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        timezone: null,
        kind: "hold",
      });
    }

    for (const row of (inqRes.data ?? []) as Array<{
      id: string;
      contact_name: string;
      company: string | null;
      event_date: string;
      status: string;
    }>) {
      if (coveredInquiryIds.has(row.id)) continue;
      out.push({
        id: row.id,
        contact_name: row.contact_name,
        company: row.company,
        event_date: row.event_date.slice(0, 10),
        status: row.status,
        kind: "inquiry",
      });
    }

    // ── Sessions ────────────────────────────────────────────────────────────
    // Titles and zones come from the series when the occurrence does not carry
    // its own. One round trip rather than one per row.
    const sessionRows = (sessionRes.data ?? []) as Array<{
      id: string;
      title: string | null;
      starts_at: string;
      ends_at: string;
      venue_id: string | null;
      series_id: string | null;
    }>;
    if (sessionRows.length > 0) {
      const seriesIds = [...new Set(sessionRows.map((r) => r.series_id).filter((v): v is string => !!v))];
      const venueIds = [...new Set(sessionRows.map((r) => r.venue_id).filter((v): v is string => !!v))];
      const seriesTitles = new Map<string, string>();
      const venueZones = new Map<string, string>();

      if (seriesIds.length > 0) {
        const { data, error } = await supabase
          .from("session_series")
          .select("id, title, timezone")
          .in("id", seriesIds);
        if (error) logServerError("workspace.loadCalendarEvents.series", error);
        for (const r of data ?? []) {
          if (typeof r.title === "string") seriesTitles.set(String(r.id), r.title);
        }
      }
      if (venueIds.length > 0) {
        const { data, error } = await supabase
          .from("venues")
          .select("id, timezone")
          .in("id", venueIds);
        if (error) logServerError("workspace.loadCalendarEvents.venues", error);
        for (const r of data ?? []) {
          if (typeof r.timezone === "string") venueZones.set(String(r.id), r.timezone);
        }
      }

      for (const row of sessionRows) {
        const zone = row.venue_id ? venueZones.get(row.venue_id) ?? null : null;
        out.push({
          id: row.id,
          contact_name:
            row.title ??
            (row.series_id ? seriesTitles.get(row.series_id) ?? "Session" : "Session"),
          company: null,
          // The LOCAL day, not the UTC slice. See localYmd.
          event_date: localYmd(row.starts_at, zone),
          status: "scheduled",
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          timezone: zone,
          kind: "session",
        });
      }
    }

    out.sort((a, b) => (a.starts_at ?? a.event_date).localeCompare(b.starts_at ?? b.event_date));
    return out;
  } catch (err) {
    logServerError("workspace.loadCalendarEvents", err);
    return [];
  }
}

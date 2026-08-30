import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

/**
 * _data-bridge/calendar.ts — calendar page data loader.
 *
 * Unions inquiries (event_date), timed agency_bookings, and firm talent_holds.
 * Empty array stays blank (no RICH_INQUIRIES mock).
 */

export type CalendarEventKind = "inquiry" | "booking" | "hold" | "order";

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

    const [inqRes, bookRes, holdRes] = await Promise.all([
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
    ]);

    if (inqRes.error) logServerError("workspace.loadCalendarEvents.inquiries", inqRes.error);
    if (bookRes.error) logServerError("workspace.loadCalendarEvents.bookings", bookRes.error);
    if (holdRes.error) logServerError("workspace.loadCalendarEvents.holds", holdRes.error);

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
        event_date: ymdFromInstant(row.starts_at),
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
        event_date: ymdFromInstant(row.starts_at),
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

    out.sort((a, b) => (a.starts_at ?? a.event_date).localeCompare(b.starts_at ?? b.event_date));
    return out;
  } catch (err) {
    logServerError("workspace.loadCalendarEvents", err);
    return [];
  }
}

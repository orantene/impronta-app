import "server-only";

/**
 * feed-read.ts — what a workspace's calendar subscription actually contains.
 *
 * TWO SOURCES, NOT ONE. Bookings are what the drawer promises ("sync your
 * Tulala bookings"), and they are not the whole of an operator's week: a venue
 * running event nights has `sessions` rows that never become an
 * `agency_bookings` row at all. A subscription that showed a photo shoot and
 * silently omitted Friday's show would be the same category of defect this is
 * fixing — a calendar that looks complete and is not.
 *
 * WHAT IS DELIBERATELY OUT
 * ────────────────────────
 *   • Individual admissions and orders. A sold-out night is one entry on an
 *     operator's calendar, not four hundred.
 *   • Table reservations and visits. They are minute-to-minute floor state, and
 *     a personal calendar synced every fifteen minutes is the wrong instrument
 *     for them — the Live Floor is the right one. Pushing them here would also
 *     put guest names into a third-party calendar account, which is a data
 *     export decision nobody has made.
 *   • Anything not tenant-scoped. Both reads pin `tenant_id`; there is no
 *     caller-supplied filter that could widen them.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import {
  CANCELLED_RETENTION_DAYS,
  FEED_FUTURE_WINDOW_DAYS,
  FEED_PAST_WINDOW_DAYS,
  type FeedEvent,
} from "./ics-feed";

type Admin = SupabaseClient<never, never, never>;

const DAY_MS = 86_400_000;

export type FeedWindow = { fromIso: string; toIso: string };

export function feedWindow(now: Date = new Date()): FeedWindow {
  return {
    fromIso: new Date(now.getTime() - FEED_PAST_WINDOW_DAYS * DAY_MS).toISOString(),
    toIso: new Date(now.getTime() + FEED_FUTURE_WINDOW_DAYS * DAY_MS).toISOString(),
  };
}

type BookingRow = {
  id: string;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_location_text: string | null;
  client_account_name: string | null;
  updated_at: string | null;
};

type SessionRow = {
  id: string;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string | null;
  updated_at: string | null;
};

/**
 * A booking's calendar status.
 *
 * `completed` maps to CONFIRMED rather than to a status of its own: the event
 * happened, and a calendar entry for a day that has passed saying anything else
 * is noise. iCal has no "done".
 */
function bookingStatus(raw: string | null): FeedEvent["status"] {
  if (raw === "cancelled") return "cancelled";
  if (raw === "tentative") return "tentative";
  return "confirmed";
}

function bookingLocation(row: BookingRow): string | null {
  const parts = [row.venue_name, row.venue_address ?? row.venue_location_text]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Cancelled rows are carried for a bounded window so subscribers receive the
 * cancellation, then dropped. Beyond it, silence is correct: a client that has
 * not polled in a month has bigger problems than one stale entry, and keeping
 * every cancellation forever grows the feed without bound.
 */
function withinCancelledRetention(row: { updated_at: string | null }, now: Date): boolean {
  const updated = row.updated_at ? Date.parse(row.updated_at) : NaN;
  if (!Number.isFinite(updated)) return false;
  return now.getTime() - updated <= CANCELLED_RETENTION_DAYS * DAY_MS;
}

export async function loadCalendarFeedEvents(
  admin: Admin,
  args: { tenantId: string; publicOrigin?: string | null },
  now: Date = new Date(),
): Promise<FeedEvent[]> {
  const window = feedWindow(now);
  const origin = args.publicOrigin?.replace(/\/+$/, "") ?? null;
  const events: FeedEvent[] = [];

  const bookings = await admin
    .from("agency_bookings")
    .select(
      "id, title, starts_at, ends_at, status, venue_name, venue_address, venue_location_text, client_account_name, updated_at",
    )
    .eq("tenant_id", args.tenantId)
    .not("starts_at", "is", null)
    .gte("starts_at", window.fromIso)
    .lte("starts_at", window.toIso)
    .order("starts_at", { ascending: true })
    .limit(2000);
  if (bookings.error) {
    logServerError("calendar/loadFeedEvents.bookings", bookings.error);
  } else {
    for (const row of (bookings.data ?? []) as BookingRow[]) {
      const status = bookingStatus(row.status);
      if (status === "cancelled" && !withinCancelledRetention(row, now)) continue;
      if (!row.starts_at) continue;
      events.push({
        uid: `booking-${row.id}`,
        summary: row.title?.trim() || row.client_account_name?.trim() || "Booking",
        description: row.client_account_name?.trim() || null,
        location: bookingLocation(row),
        // A booking with no end is an hour long IN THE FEED ONLY, and the
        // reason it is not dropped like a start-less one is that an operator
        // reads a booking's END from the call sheet, not from the calendar:
        // omitting the whole entry would hide a real commitment, while a
        // one-hour block on the right day at the right time is a true statement
        // about when it begins.
        startsAt: row.starts_at,
        endsAt: row.ends_at ?? new Date(Date.parse(row.starts_at) + 3_600_000).toISOString(),
        url: origin ? `${origin}/admin/bookings/${row.id}` : null,
        status,
        updatedAt: row.updated_at,
      });
    }
  }

  const sessions = await admin
    .from("sessions")
    .select("id, title, starts_at, ends_at, status, updated_at")
    .eq("tenant_id", args.tenantId)
    .gte("starts_at", window.fromIso)
    .lte("starts_at", window.toIso)
    .order("starts_at", { ascending: true })
    .limit(2000);
  if (sessions.error) {
    logServerError("calendar/loadFeedEvents.sessions", sessions.error);
  } else {
    for (const row of (sessions.data ?? []) as SessionRow[]) {
      if (!row.starts_at || !row.ends_at) continue;
      const status: FeedEvent["status"] =
        row.status === "cancelled" ? "cancelled" : "confirmed";
      if (status === "cancelled" && !withinCancelledRetention(row, now)) continue;
      events.push({
        uid: `session-${row.id}`,
        summary: row.title?.trim() || "Session",
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        status,
        updatedAt: row.updated_at,
      });
    }
  }

  events.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return events;
}

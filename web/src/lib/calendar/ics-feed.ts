/**
 * ics-feed.ts — the workspace's operational calendar as one subscribable
 * RFC 5545 feed.
 *
 * WHY THIS EXISTS. The Calendar sync drawer has shipped an iCal subscription
 * URL since it was written. The URL was a string constant
 * (`.../cal/export/impronta-oran.ics?token=abc123`) pointing at a route that
 * did not exist, next to a "Google Calendar · Two-way sync · Last synced 4 min
 * ago" row and two disabled buttons. An operator who copied that URL into Apple
 * Calendar got a subscription that never resolved, and no part of the product
 * ever told them why. This is the read side of that promise, made real.
 *
 * READ-ONLY, AND THAT IS THE WHOLE DESIGN. A subscription feed is a poll: the
 * calendar app fetches a URL and replaces its copy. Nothing an operator does in
 * Google Calendar can travel back down it. Two-way sync is a different
 * mechanism (OAuth, per-provider APIs, conflict resolution, a write authority
 * decision) and is a milestone of its own. Shipping the poll and CALLING it a
 * poll is the correction; shipping the poll and leaving "two-way sync" on the
 * screen would have been the same defect with a working URL behind it.
 *
 * ONE VEVENT PER BOOKING, WITH CANCELLED ONES INCLUDED
 * ────────────────────────────────────────────────────
 * The obvious feed is "confirmed bookings only", and it is wrong in a way that
 * only shows up on the second fetch. Calendar clients differ on whether a
 * disappeared VEVENT is a deletion or a transport glitch, and several keep the
 * stale copy. An operator would then hold a cancelled shoot on their phone with
 * nothing anywhere saying it was off — a worse failure than the missing route,
 * because it looks like it is working.
 *
 * So a cancelled booking stays in the feed with `STATUS:CANCELLED` for a
 * bounded window, which every major client understands as "remove this", and
 * only then falls out. `SEQUENCE` increments off `updated_at` so a client that
 * caches by UID takes the newer copy.
 *
 * TIMES ARE UTC `Z` STAMPS, deliberately, matching `buildIcsEvent`. A booking
 * carries `timezone`, and emitting `DTSTART;TZID=America/Mexico_City` would be
 * more faithful — but only if the feed also ships the matching VTIMEZONE
 * component, and an unshipped or wrong VTIMEZONE moves an event by hours in
 * clients that do not carry their own database. UTC cannot be wrong; it can
 * only be less pretty in a client's "original time zone" display.
 */

import { escapeIcs, fold, toUtcStamp } from "@/lib/ui/ics";

/** One row of the feed, already flattened out of whatever table produced it. */
export type FeedEvent = {
  /**
   * Stable for the lifetime of the underlying record. A UID that changes
   * between fetches is a new event every poll, which is how a subscription
   * turns into a hundred duplicate entries.
   */
  uid: string;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  startsAt: string;
  endsAt: string;
  /** Drives `STATUS:`; `cancelled` is what makes a client delete its copy. */
  status: "confirmed" | "tentative" | "cancelled";
  /** Feeds `SEQUENCE`, so an edited booking supersedes the cached copy. */
  updatedAt?: string | null;
};

export type FeedOptions = {
  /** The name a calendar app shows for the whole subscription. */
  calendarName: string;
  /**
   * Poll hint, in minutes. Advisory in every client — Google refreshes on its
   * own schedule regardless — so the drawer must not promise this as a number
   * the product controls.
   */
  refreshMinutes?: number;
};

/** How long a cancelled booking keeps announcing its own cancellation. */
export const CANCELLED_RETENTION_DAYS = 30;

/**
 * How far back the feed reaches. A calendar subscription is for the work ahead;
 * a year of finished bookings is a slow fetch on every poll and a phone that
 * scrolls through history nobody opened the app for.
 */
export const FEED_PAST_WINDOW_DAYS = 30;

/** And how far forward. Beyond a year the schedule is not real yet. */
export const FEED_FUTURE_WINDOW_DAYS = 365;

function sequenceFor(updatedAt: string | null | undefined): number {
  if (!updatedAt) return 0;
  const ms = Date.parse(updatedAt);
  if (!Number.isFinite(ms)) return 0;
  // Whole minutes since the epoch. Seconds would overflow the 32-bit SEQUENCE
  // some clients still assume; minutes stay inside it until the year 6000 and
  // are finer than any human edit rate.
  return Math.max(0, Math.floor(ms / 60_000));
}

function veventLines(event: FeedEvent, stampedAt: Date): string[] {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  return [
    "BEGIN:VEVENT",
    `UID:${escapeIcs(event.uid)}@tulala.digital`,
    `DTSTAMP:${toUtcStamp(stampedAt)}`,
    `DTSTART:${toUtcStamp(start)}`,
    `DTEND:${toUtcStamp(end)}`,
    `SEQUENCE:${sequenceFor(event.updatedAt)}`,
    `STATUS:${event.status.toUpperCase()}`,
    fold(`SUMMARY:${escapeIcs(event.summary)}`),
    event.description ? fold(`DESCRIPTION:${escapeIcs(event.description)}`) : null,
    event.location ? fold(`LOCATION:${escapeIcs(event.location)}`) : null,
    event.url ? fold(`URL:${escapeIcs(event.url)}`) : null,
    "END:VEVENT",
  ].filter((line): line is string => line !== null);
}

/**
 * An event with no usable start, or with an end at or before its start, is
 * DROPPED rather than repaired.
 *
 * Guessing an hour's duration would put a made-up block on an operator's real
 * calendar, and they have no way to tell it apart from one they were given. A
 * booking with no times is not yet a calendar entry; it is a booking with no
 * times, and the place to fix that is the booking.
 */
export function isFeedable(event: FeedEvent): boolean {
  const start = Date.parse(event.startsAt);
  const end = Date.parse(event.endsAt);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

export function buildIcsFeed(
  events: ReadonlyArray<FeedEvent>,
  options: FeedOptions,
  now: Date = new Date(),
): string {
  const refresh = Math.max(5, Math.trunc(options.refreshMinutes ?? 15));
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tulala//Workspace Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${escapeIcs(options.calendarName)}`),
    // Both spellings on purpose: `REFRESH-INTERVAL` is the RFC 7986 property,
    // `X-PUBLISHED-TTL` is what Outlook reads. Neither is binding.
    `REFRESH-INTERVAL;VALUE=DURATION:PT${refresh}M`,
    `X-PUBLISHED-TTL:PT${refresh}M`,
  ];
  for (const event of events) {
    if (!isFeedable(event)) continue;
    lines.push(...veventLines(event, now));
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

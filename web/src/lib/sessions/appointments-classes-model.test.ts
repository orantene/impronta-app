/**
 * appointments-classes-model.test.ts — the Sessions and Series tables' rows
 * (board W39, W40), decided by the pure model behind the page.
 *
 * Lives in the sessions lane because it is a sessions fact: how a dated
 * session becomes a row, which day it files under, what its pill says, and
 * what "needs attention" keeps.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSeriesRows,
  buildSessionRows,
  filterRows,
  groupByDay,
  needsAttention,
  sessionState,
  viewWindow,
  waitlistCount,
} from "@/components/admin/shell/internal/page-modules/appointments-classes-model";
import type { ScheduleNight, ScheduleOccurrence, ScheduleSeries } from "@/lib/sessions/schedule-actions";
import type { WaitlistView } from "@/lib/scheduling/waitlist-desk";

function occurrence(over: Partial<ScheduleOccurrence> = {}): ScheduleOccurrence {
  return {
    id: "s1",
    startsAt: "2026-09-15T16:30:00.000Z",
    endsAt: "2026-09-15T17:30:00.000Z",
    status: "scheduled",
    seatsTotal: 12,
    seatsRemaining: 3,
    poolKey: "default",
    poolCount: 1,
    venueName: "Studio A",
    ...over,
  };
}

function series(over: Partial<ScheduleSeries> = {}): ScheduleSeries {
  return {
    id: "ser1",
    title: "Pilates Reformer",
    localTime: "11:30",
    timeZone: "America/Mexico_City",
    weekdays: [2, 4],
    durationMinutes: 60,
    seats: 12,
    startsOn: "2026-09-01",
    endsOn: null,
    isActive: true,
    venueName: "Studio A",
    occurrences: [occurrence(), occurrence({ id: "s2", startsAt: "2026-09-17T16:30:00.000Z", endsAt: "2026-09-17T17:30:00.000Z" })],
    refusalReason: null,
    skipped: [],
    ...over,
  };
}

test("the pill: cancelled, completed, full, needs seats, scheduled; unread seats are never full", () => {
  assert.equal(sessionState(occurrence({ status: "cancelled" })), "cancelled");
  assert.equal(sessionState(occurrence({ status: "completed" })), "completed");
  assert.equal(sessionState(occurrence({ seatsRemaining: 0 })), "full");
  assert.equal(sessionState(occurrence({ seatsTotal: null, seatsRemaining: null })), "needsSeats");
  assert.equal(sessionState(occurrence({ seatsRemaining: null })), "scheduled", "a read that failed must not print Full");
  assert.equal(sessionState(occurrence()), "scheduled");
  assert.equal(needsAttention("full"), true);
  assert.equal(needsAttention("needsSeats"), true);
  assert.equal(needsAttention("scheduled"), false);
});

test("a series' sessions and one-off nights are the same kind of row, filed on the venue's day", () => {
  const night: ScheduleNight = { ...occurrence({ id: "n1", startsAt: "2026-09-16T03:30:00.000Z", endsAt: "2026-09-16T05:00:00.000Z", venueName: null }), title: "QA Night", venueName: null };
  const waitlists: WaitlistView[] = [
    {
      sessionId: "s1",
      sessionTitle: "Pilates Reformer",
      startsAt: "2026-09-15T16:30:00.000Z",
      endsAt: "2026-09-15T17:30:00.000Z",
      seats: { kind: "counted", total: 12, remaining: 3 },
      entries: [
        { id: "w1", sessionId: "s1", customerName: "Ana", customerEmail: null, partySize: 1, status: "waiting", joinedAt: "2026-09-10T00:00:00Z", offeredAt: null, offerExpiresAt: null, position: 1, state: "waiting" },
        { id: "w2", sessionId: "s1", customerName: "Beto", customerEmail: null, partySize: 1, status: "accepted", joinedAt: "2026-09-10T00:01:00Z", offeredAt: null, offerExpiresAt: null, position: 2, state: "accepted" },
      ],
      nextInLineId: "w1",
    },
  ];
  const rows = buildSessionRows({ series: [series()], nights: [night], waitlists, fallbackTimeZone: "America/Mexico_City" });
  assert.deepEqual(rows.map((r) => r.id), ["s1", "n1", "s2"], "rows are sorted by start, series and nights together");
  const first = rows[0]!;
  assert.equal(first.ymd, "2026-09-15");
  assert.equal(first.seriesIndex, 1);
  assert.equal(first.seriesCount, 2);
  assert.equal(first.booked, 9);
  assert.equal(first.waiting, 1, "only waiting and offered entries count as waiting; an accepted place holds a seat");
  assert.equal(first.room, "Studio A");
  // 03:30Z on the 16th is the evening of the 15th in Mexico City.
  const one = rows[1]!;
  assert.equal(one.ymd, "2026-09-15");
  assert.equal(one.seriesId, null);
  assert.equal(one.title, "QA Night");
  assert.equal(waitlistCount(waitlists), 1);
  assert.deepEqual(
    groupByDay(rows).map((g) => [g.ymd, g.rows.length]),
    [
      ["2026-09-15", 2],
      ["2026-09-17", 1],
    ],
  );
});

test("the window: a week from the anchor, one day, or everything ahead; filters compose", () => {
  assert.deepEqual(viewWindow("week", "2026-09-14"), { from: "2026-09-14", to: "2026-09-21" });
  assert.deepEqual(viewWindow("day", "2026-09-14"), { from: "2026-09-14", to: "2026-09-15" });
  assert.deepEqual(viewWindow("list", "2026-09-14"), { from: "2026-09-14", to: null });
  const rows = buildSessionRows({ series: [series()], nights: [], waitlists: [], fallbackTimeZone: "UTC" });
  assert.equal(filterRows(rows, { view: "day", anchorYmd: "2026-09-15", room: null, attentionOnly: false }).length, 1);
  assert.equal(filterRows(rows, { view: "week", anchorYmd: "2026-09-14", room: "Studio B", attentionOnly: false }).length, 0);
  assert.equal(filterRows(rows, { view: "list", anchorYmd: "2026-09-01", room: null, attentionOnly: true }).length, 0);
});

test("a series row: generated through the last dated session; a refusal is needs attention; inactive is paused", () => {
  const [ok] = buildSeriesRows([series()]);
  assert.equal(ok!.state, "published");
  assert.equal(ok!.generatedThrough, "2026-09-17T16:30:00.000Z");
  assert.equal(ok!.sessionCount, 2);
  const [refused] = buildSeriesRows([series({ occurrences: [], refusalReason: "timezone_unconfirmed" })]);
  assert.equal(refused!.state, "needsAttention");
  assert.equal(refused!.generatedThrough, null);
  const [paused] = buildSeriesRows([series({ isActive: false })]);
  assert.equal(paused!.state, "paused");
});

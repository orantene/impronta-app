import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentAgendaItem } from "@/lib/talent-agenda/types";
import {
  chipTag,
  daySummary,
  filterCounts,
  layoutLanes,
  serviceLabel,
  matchesFilter,
  monthCells,
  nextFreeTime,
  requestOverlap,
  shiftMonth,
  stepDate,
  stripDots,
  timeRange,
} from "./calendar-view";

function at(h: number, m = 0, day = 24): string {
  return new Date(2026, 8, day, h, m).toISOString();
}

function item(over: Partial<TalentAgendaItem>): TalentAgendaItem {
  return {
    id: "x",
    kind: "booking",
    title: "Manicure",
    lines: [],
    startsAt: at(10),
    endsAt: at(11),
    allDay: false,
    tz: "America/Mexico_City",
    where: { mode: "studio", label: "" },
    bufferAfterMin: 0,
    booking: "confirmed",
    payment: "none",
    money: { totalCents: 0, paidCents: 0, dueCents: 0, currency: "MXN" },
    source: "manual",
    blocksTime: true,
    history: [],
    ...over,
  } as TalentAgendaItem;
}

describe("calendar chip words (never colour alone)", () => {
  it("names every state", () => {
    assert.equal(chipTag(item({})).key, "Confirmed");
    assert.equal(chipTag(item({ booking: "requested", kind: "request" })).key, "Request · not blocking");
    assert.equal(chipTag(item({ booking: "completed" })).key, "Completed");
    assert.equal(chipTag(item({ kind: "block" })).key, "Blocked");
    const hold = chipTag(item({ booking: "hold", holdUntil: at(18, 0) }));
    assert.equal(hold.key, "On hold until");
    assert.equal(hold.suffix, "18:00");
    const agency = chipTag(item({ managedBy: { agencyId: "a", name: "Impronta" } }));
    assert.equal(agency.key, "agency job");
    assert.equal(agency.suffix, "Impronta");
  });
});

describe("request overlap", () => {
  const request = item({
    id: "r",
    kind: "request",
    booking: "requested",
    blocksTime: false,
    startsAt: at(12, 30),
    endsAt: at(13, 30),
  });
  it("finds a confirmed booking under a request", () => {
    const daniela = item({ id: "d", title: "Daniela", startsAt: at(12), endsAt: at(13, 5) });
    assert.equal(requestOverlap(request, [request, daniela])?.id, "d");
  });
  it("ignores other requests and non-overlapping bookings", () => {
    const other = item({ id: "o", kind: "request", booking: "requested", blocksTime: false, startsAt: at(12), endsAt: at(13) });
    const later = item({ id: "l", startsAt: at(14), endsAt: at(15) });
    assert.equal(requestOverlap(request, [other, later]), null);
  });
  it("only applies to requests", () => {
    assert.equal(requestOverlap(item({ id: "c" }), [item({ id: "d" })]), null);
  });
});

describe("list filters", () => {
  const rows = [
    item({ id: "1" }),
    item({ id: "2", booking: "requested", kind: "request", blocksTime: false }),
    item({ id: "3", booking: "hold" }),
    item({ id: "4", booking: "completed" }),
    item({ id: "5", kind: "block" }),
  ];
  it("counts add up to All and skip blocks", () => {
    const c = filterCounts(rows);
    assert.equal(c.all, 4);
    assert.equal(c.requested + c.hold + c.confirmed + c.completed + c.cancelled, c.all);
    assert.equal(matchesFilter(rows[4], "all"), false);
  });
});

describe("day summary and dots", () => {
  it("sums booked minutes, excluding requests and blocks", () => {
    const s = daySummary([
      item({ startsAt: at(10), endsAt: at(11, 30) }),
      item({ booking: "requested", kind: "request" }),
      item({ kind: "block" }),
    ]);
    assert.deepEqual(s, { count: 1, minutes: 90 });
  });
  it("marks a hollow dot for requests and holds", () => {
    assert.deepEqual(stripDots([item({}), item({ booking: "hold" })]), { solid: 1, hollow: true });
  });
});

describe("dates", () => {
  it("month grid starts on Monday and has 42 cells", () => {
    const cells = monthCells(new Date(2026, 8, 23));
    assert.equal(cells.length, 42);
    assert.equal(cells[0].getDay(), 1);
    assert.equal(cells[0].getDate(), 31);
  });
  it("shiftMonth clamps day", () => {
    const d = shiftMonth(new Date(2026, 0, 31), 1);
    assert.equal(d.getMonth(), 1);
    assert.equal(d.getDate(), 28);
  });
  it("arrows step per view", () => {
    const base = new Date(2026, 8, 23);
    assert.equal(stepDate(base, "day", 1).getDate(), 24);
    assert.equal(stepDate(base, "week", -1).getDate(), 16);
    assert.equal(stepDate(base, "month", 1).getMonth(), 9);
  });
  it("timeRange is 24h", () => {
    assert.equal(timeRange(at(13, 45), at(14, 45)), "13:45–14:45");
  });
  it("next free time skips closed days", () => {
    const now = new Date(2026, 8, 27, 9);
    const sunday = new Date(2026, 8, 27);
    const next = nextFreeTime(sunday, [], (d) => (d.getDay() === 0 ? [] : [{ startMin: 600, endMin: 1140 }]), now);
    assert.ok(next);
    assert.equal(next.getDate(), 28);
    assert.equal(next.getHours(), 10);
  });
});

describe("layoutLanes", () => {
  it("puts visually overlapping chips side by side and leaves lone chips full width", () => {
    const lanes = layoutLanes([
      { id: "a", top: 0, bottom: 30 },
      { id: "b", top: 20, bottom: 50 },
      { id: "c", top: 40, bottom: 70 },
      { id: "d", top: 100, bottom: 130 },
    ]);
    assert.deepEqual(lanes.get("a"), { lane: 0, lanes: 2 });
    assert.deepEqual(lanes.get("b"), { lane: 1, lanes: 2 });
    assert.deepEqual(lanes.get("c"), { lane: 0, lanes: 2 });
    assert.deepEqual(lanes.get("d"), { lane: 0, lanes: 1 });
  });
});

describe("serviceLabel", () => {
  const client = { name: "Bozo", initials: "B" };
  it("prefers the first line item", () => {
    assert.equal(
      serviceLabel({ kind: "booking", title: "Bozo", client, lines: [{ label: "Gel polish", cents: 1 }] }),
      "Gel polish",
    );
  });
  it("never returns the client's name as the service", () => {
    assert.equal(serviceLabel({ kind: "booking", title: "Bozo", client, lines: [{ label: "bozo", cents: 1 }] }), null);
  });
});

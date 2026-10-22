import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { TalentAgendaItem } from "@/lib/talent-agenda/types";

import { buildAgendaListItemFromAgendaItem } from "./view-model";

// Shape of mapUnscheduledDraftBooking's output (created_at as sort key, UTC, placeholder place).
const draft = (): TalentAgendaItem => ({
  id: "b-1",
  kind: "booking",
  ref: { table: "agency_bookings", id: "b-1" },
  client: { name: "Lucía Ramírez", initials: "LR" },
  title: "Lucía Ramírez",
  lines: [],
  startsAt: "2026-10-22T00:52:00.000Z",
  endsAt: "2026-10-22T00:52:00.000Z",
  allDay: true,
  tz: "UTC",
  where: { mode: "online", label: "No time" },
  bufferAfterMin: 0,
  booking: "requested",
  payment: "none",
  money: { totalCents: 0, paidCents: 0, dueCents: 0, currency: "MXN" },
  source: "website",
  unscheduled: true,
  blocksTime: false,
  history: [],
});

describe("TUL-1244 booking record of a no-time draft says what Today says", () => {
  it("does not show the created_at sort key as a UTC time or the placeholder place as Where", () => {
    const row = buildAgendaListItemFromAgendaItem(draft());
    assert.equal(row.whenLabel, "No time assigned");
    assert.equal(row.whereLabel, ""); // TUL-1889: the record hides the Where row instead of "Not set yet"
    assert.equal(row.startsAtIso, undefined);
    assert.equal(row.endsAtIso, undefined);
  });
  it("a scheduled booking keeps its real time", () => {
    const item = { ...draft(), unscheduled: false, startsAt: "2026-10-21T14:00:00.000Z", endsAt: "2026-10-21T15:00:00.000Z", allDay: false, tz: "America/Cancun" };
    const row = buildAgendaListItemFromAgendaItem(item);
    assert.notEqual(row.whenLabel, "No time assigned");
    assert.equal(row.startsAtIso, item.startsAt);
  });
  it("the calendar grid never receives no-time drafts", () => {
    const src = readFileSync(join(process.cwd(), "src/components/admin/shell/internal/talent/agenda/AgendaCalendarPage.tsx"), "utf8");
    assert.match(src, /\.filter\(\(item\) => !item\.unscheduled\)/);
  });
});

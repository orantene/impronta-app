import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentAgendaItem } from "@/lib/talent-agenda/types";
import { buildIcsCalendar } from "@/lib/ui/ics";
import { agendaItemToIcs, downloadRange, exportableItems } from "./calendar-sync";

function at(h: number, day = 24): string {
  return new Date(2026, 8, day, h).toISOString();
}

function item(over: Partial<TalentAgendaItem>): TalentAgendaItem {
  return {
    id: "x",
    kind: "booking",
    ref: { table: "agency_bookings", id: "b1" },
    title: "Manicure",
    lines: [],
    startsAt: at(10),
    endsAt: at(11),
    allDay: false,
    tz: "America/Mexico_City",
    where: { mode: "studio", label: "Studio, Roma" },
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

describe("calendar sync download", () => {
  const from = new Date(2026, 8, 21);
  const to = new Date(2026, 8, 28);

  it("keeps confirmed and blocks in range, drops requests, cancelled and out of range", () => {
    const rows = exportableItems(
      [
        item({ id: "a", startsAt: at(12), endsAt: at(13) }),
        item({ id: "b", kind: "request", booking: "requested" }),
        item({ id: "c", booking: "cancelled" }),
        item({ id: "d", kind: "block", title: "", startsAt: at(9), endsAt: at(10) }),
        item({ id: "e", startsAt: at(10, 30), endsAt: at(11, 30) }),
      ],
      from,
      to,
    );
    assert.deepEqual(
      rows.map((r) => r.id),
      ["d", "a"],
    );
  });

  it("maps an item to an ics event with a stable uid", () => {
    const ev = agendaItemToIcs(item({}));
    assert.equal(ev.uid, "agency_bookings-b1");
    assert.equal(ev.location, "Studio, Roma");
    assert.equal(agendaItemToIcs(item({ kind: "block", title: "" }), "Bloqueado").summary, "Bloqueado");
  });

  it("builds one VCALENDAR with one VEVENT per item", () => {
    const ics = buildIcsCalendar([agendaItemToIcs(item({})), agendaItemToIcs(item({ id: "y", ref: { table: "t", id: "2" } }))]);
    assert.equal(ics.match(/BEGIN:VEVENT/g)?.length, 2);
    assert.equal(ics.match(/BEGIN:VCALENDAR/g)?.length, 1);
    assert.ok(ics.includes("LOCATION:Studio\\, Roma"));
  });

  it("week and month ranges", () => {
    const w = downloadRange(new Date(2026, 8, 24), "week", new Date(2026, 8, 21, 15));
    assert.equal(w.from.getDate(), 21);
    assert.equal(w.to.getDate(), 28);
    const m = downloadRange(new Date(2026, 8, 24), "month", new Date(2026, 8, 21));
    assert.equal(m.from.getMonth(), 8);
    assert.equal(m.to.getMonth(), 9);
  });
});

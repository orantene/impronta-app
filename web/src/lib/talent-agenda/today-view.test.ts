import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentAgendaItem } from "./types";
import {
  bookedLabel,
  greetingFor,
  owedFromAgenda,
  resolveQualityCardMode,
  resolveTodayMode,
  todayAppointmentAction,
  todayAppointments,
  todayAttentionAction,
  upNextDay,
} from "./today-view";

const NOW = new Date(2026, 8, 23, 9, 30);

function at(day: number, h: number, m = 0): string {
  return new Date(2026, 8, day, h, m).toISOString();
}

function item(over: Partial<TalentAgendaItem> = {}): TalentAgendaItem {
  return {
    id: over.id ?? "b1",
    kind: "booking",
    ref: { table: "agency_bookings", id: "b1" },
    client: { name: "Valeria Ruiz", initials: "VR" },
    title: "Gel",
    lines: [],
    startsAt: at(23, 11),
    endsAt: at(23, 12),
    allDay: false,
    tz: "America/Cancun",
    where: { mode: "studio", label: "Studio" },
    bufferAfterMin: 0,
    booking: "confirmed",
    payment: "paid",
    money: { totalCents: 50000, paidCents: 50000, dueCents: 0, currency: "MXN" },
    source: "manual",
    blocksTime: true,
    history: [],
    ...over,
  };
}

describe("resolveTodayMode", () => {
  it("established talent with services and a live site is never first run", () => {
    assert.equal(
      resolveTodayMode({ agendaItemCount: 0, bookableCount: 22, sitePublished: true }),
      "established",
    );
    assert.equal(
      resolveTodayMode({ agendaItemCount: 0, bookableCount: 22, sitePublished: false }),
      "established",
    );
  });
  it("agenda items alone mean established", () => {
    assert.equal(
      resolveTodayMode({ agendaItemCount: 3, bookableCount: 0, sitePublished: false }),
      "established",
    );
  });
  it("unknown services never claims new", () => {
    assert.equal(
      resolveTodayMode({ agendaItemCount: 0, bookableCount: null, sitePublished: false }),
      "established",
    );
  });
  it("nothing to sell, nothing booked, no site is first run", () => {
    assert.equal(
      resolveTodayMode({ agendaItemCount: 0, bookableCount: 0, sitePublished: false }),
      "first_run",
    );
  });
});

describe("resolveQualityCardMode", () => {
  it("live wins over percent", () => {
    assert.equal(resolveQualityCardMode({ percent: 74, sitePublished: true }), "live");
  });
  it("checklist below 100, ready at 100, hidden while loading", () => {
    assert.equal(resolveQualityCardMode({ percent: 74, sitePublished: false }), "checklist");
    assert.equal(resolveQualityCardMode({ percent: 100, sitePublished: false }), "ready");
    assert.equal(resolveQualityCardMode({ percent: null, sitePublished: false }), "hidden");
  });
});

describe("todayAttentionAction", () => {
  it("direct request is Reply, agency request is Review", () => {
    assert.equal(todayAttentionAction(item({ kind: "request", booking: "requested" })).label, "Reply");
    const agency = todayAttentionAction(
      item({ kind: "request", booking: "requested", managedBy: { agencyId: "a", name: "Impronta" } }),
    );
    assert.equal(agency.label, "Review");
    assert.equal(agency.chip, "Impronta");
  });
  it("unpaid hold and overdue ask for a payment link", () => {
    assert.equal(
      todayAttentionAction(item({ kind: "hold", booking: "hold", payment: "awaiting" })).label,
      "Send a payment link",
    );
    assert.equal(todayAttentionAction(item({ payment: "overdue" })).label, "Send a payment link");
  });
});

describe("todayAppointmentAction", () => {
  it("paid and upcoming is Check in", () => {
    assert.deepEqual(todayAppointmentAction(item(), NOW), { kind: "check_in" });
  });
  it("balance due is Collect with amount", () => {
    assert.deepEqual(
      todayAppointmentAction(
        item({ payment: "partial", money: { totalCents: 150000, paidCents: 45000, dueCents: 105000, currency: "MXN" } }),
        NOW,
      ),
      { kind: "collect", cents: 105000 },
    );
  });
  it("nothing paid yet is Request deposit", () => {
    assert.deepEqual(
      todayAppointmentAction(
        item({ payment: "none", money: { totalCents: 95000, paidCents: 0, dueCents: 95000, currency: "MXN" } }),
        NOW,
      ),
      { kind: "request_deposit" },
    );
  });
  it("hold with no agreed price is Send a payment link", () => {
    assert.deepEqual(
      todayAppointmentAction(
        item({ kind: "hold", booking: "hold", payment: "awaiting", money: { totalCents: 0, paidCents: 0, dueCents: 0, currency: "MXN" } }),
        NOW,
      ),
      { kind: "payment_link" },
    );
  });
  it("completed has no action", () => {
    assert.equal(todayAppointmentAction(item({ booking: "completed" }), NOW), null);
  });
});

describe("day lists", () => {
  const items = [
    item({ id: "a", startsAt: at(23, 13, 30), endsAt: at(23, 15, 45) }),
    item({ id: "b", startsAt: at(23, 11), endsAt: at(23, 12) }),
    item({ id: "c", booking: "cancelled", startsAt: at(23, 17), endsAt: at(23, 18) }),
    item({ id: "d", kind: "request", booking: "requested", startsAt: at(23, 18), endsAt: at(23, 19) }),
    item({ id: "e", startsAt: at(25, 10), endsAt: at(25, 11) }),
    item({ id: "f", startsAt: at(24, 10), endsAt: at(24, 11, 45) }),
  ];
  it("today keeps live bookings in time order", () => {
    assert.deepEqual(todayAppointments(items, NOW).map((i) => i.id), ["b", "a"]);
  });
  it("up next is the first later day with work", () => {
    const next = upNextDay(items, NOW);
    assert.deepEqual(next?.items.map((i) => i.id), ["f"]);
  });
  it("up next is null on an empty week", () => {
    assert.equal(upNextDay([], NOW), null);
  });
});

describe("owedFromAgenda", () => {
  it("counts overdue and started balances only", () => {
    const owed = owedFromAgenda(
      [
        item({ id: "o", payment: "overdue", startsAt: at(20, 10), money: { totalCents: 62000, paidCents: 0, dueCents: 62000, currency: "MXN" } }),
        item({ id: "s", payment: "due", startsAt: at(23, 8), money: { totalCents: 10000, paidCents: 0, dueCents: 10000, currency: "MXN" } }),
        item({ id: "later", payment: "due", startsAt: at(23, 17), money: { totalCents: 95000, paidCents: 0, dueCents: 95000, currency: "MXN" } }),
      ],
      NOW,
    );
    assert.deepEqual(owed, { cents: 72000, count: 2, currency: "MXN" });
  });
});

describe("labels", () => {
  it("booked label", () => {
    assert.equal(bookedLabel(255), "4 h 15");
    assert.equal(bookedLabel(180), "3 h");
    assert.equal(bookedLabel(45), "45 min");
  });
  it("greeting by hour", () => {
    assert.equal(greetingFor(NOW), "Good morning");
    assert.equal(greetingFor(new Date(2026, 8, 23, 14)), "Good afternoon");
    assert.equal(greetingFor(new Date(2026, 8, 23, 20)), "Good evening");
  });
});

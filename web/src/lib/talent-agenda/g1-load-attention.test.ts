import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { needsAttention, occupiedInterval } from "./derive";
import type { TalentAgendaItem } from "./types";

const now = new Date("2026-09-23T09:50:00-05:00");

function baseBooking(overrides: Partial<TalentAgendaItem> = {}): TalentAgendaItem {
  return {
    id: "b1",
    kind: "booking",
    ref: { table: "agency_bookings", id: "b1" },
    title: "Session",
    lines: [],
    startsAt: "2026-09-23T14:00:00-05:00",
    endsAt: "2026-09-23T15:00:00-05:00",
    allDay: false,
    tz: "America/Cancun",
    where: { mode: "away", label: "Client home" },
    bufferAfterMin: 15,
    booking: "confirmed",
    payment: "paid",
    money: { totalCents: 1000_00, paidCents: 1000_00, dueCents: 0, currency: "MXN" },
    source: "website",
    blocksTime: true,
    history: [],
    ...overrides,
  };
}

describe("G1.1 travel / intake / reschedule attention", () => {
  it("occupiedInterval pads start and end with travelMin", () => {
    const item = baseBooking({
      where: { mode: "away", label: "Client home", travelMin: 20 },
      bufferAfterMin: 10,
    });
    const occ = occupiedInterval(item);
    assert.equal(occ.startsAt.toISOString(), new Date("2026-09-23T13:40:00-05:00").toISOString());
    assert.equal(occ.endsAt.toISOString(), new Date("2026-09-23T15:30:00-05:00").toISOString());
  });

  it("needsAttention includes pending intake", () => {
    const item = baseBooking({
      tradeSection: { kind: "intake", payload: { status: "pending" } },
    });
    const attn = needsAttention([item], now);
    assert.equal(attn.length, 1);
    assert.equal(attn[0]!.id, "b1");
  });

  it("needsAttention includes pending reschedule", () => {
    const item = baseBooking({
      tradeSection: {
        kind: "event",
        payload: { rescheduleRequestId: "rr1", rescheduleStatus: "pending" },
      },
      history: [{ at: now.toISOString(), text: "Reschedule pending." }],
    });
    const attn = needsAttention([item], now);
    assert.equal(attn.length, 1);
    assert.equal(attn[0]!.id, "b1");
  });

  it("agency managedBy name is preserved for the chip", () => {
    const item = baseBooking({
      source: "agency",
      managedBy: { agencyId: "a1", name: "Impronta Cancún" },
      booking: "requested",
      kind: "request",
    });
    assert.equal(item.managedBy?.name, "Impronta Cancún");
    const attn = needsAttention([item], now);
    assert.ok(attn.some((i) => i.managedBy?.name === "Impronta Cancún"));
  });
});

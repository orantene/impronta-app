import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentAgendaItem } from "@/lib/talent-agenda/types";

import {
  buildAgendaListItemFromAgendaItem,
  buildCancelConsequences,
  isCompletedUnpaid,
} from "./view-model";

function base(over: Partial<TalentAgendaItem> = {}): TalentAgendaItem {
  return {
    id: "bk-1",
    kind: "booking",
    ref: { table: "agency_bookings", id: "bk-1" },
    title: "Russian manicure",
    lines: [],
    startsAt: "2026-09-21T17:00:00.000Z",
    endsAt: "2026-09-21T18:00:00.000Z",
    tz: "America/Cancun",
    allDay: false,
    booking: "completed",
    payment: "overdue",
    source: "website",
    where: { mode: "studio", label: "Studio" },
    client: { name: "Lucía Mendoza", initials: "LM" },
    money: { totalCents: 62000, paidCents: 0, dueCents: 62000, currency: "MXN" },
    history: [],
    bufferAfterMin: 0,
    blocksTime: true,
    ...over,
  };
}

describe("AUD-017 · completed unpaid → Request payment", () => {
  it("isCompletedUnpaid is true for completed + overdue with due", () => {
    assert.equal(
      isCompletedUnpaid({ booking: "completed", payment: "overdue", dueCents: 62000 }),
      true,
    );
  });

  it("isCompletedUnpaid is false when paid", () => {
    assert.equal(
      isCompletedUnpaid({ booking: "completed", payment: "paid", dueCents: 0 }),
      false,
    );
  });

  it("view-model sets Request payment Now box for Lucía-style record", () => {
    const item = buildAgendaListItemFromAgendaItem(base());
    assert.equal(item.nowTitle, "{amount} unpaid · completed");
    assert.equal(item.nowTone, "risk");
    assert.equal(item.nowActionLabel, "Request payment");
    assert.equal(item.paidCents, 0);
    assert.equal(item.dueCents, 62000);
  });
});

describe("AUD-017 · hold expiry / time left", () => {
  it("hold Now body uses until/left placeholders and Request deposit", () => {
    const item = buildAgendaListItemFromAgendaItem(
      base({
        kind: "hold",
        booking: "hold",
        payment: "awaiting",
        holdUntil: "2026-09-23T16:40:00.000Z",
        title: "Volume lashes",
        client: { name: "Sofía Márquez", initials: "SM" },
        money: { totalCents: 150000, paidCents: 0, dueCents: 30000, currency: "MXN" },
      }),
    );
    assert.equal(item.bookingState, "hold");
    assert.equal(item.holdUntil, "2026-09-23T16:40:00.000Z");
    assert.equal(
      item.nowBody,
      "Held until {until}, {left} left. If no deposit arrives by then, this time is released.",
    );
    assert.equal(item.nowActionLabel, "Request deposit");
  });
});

describe("AUD-017 · cancel consequences", () => {
  it("talent cancel with deposit → full refund confirm", () => {
    const c = buildCancelConsequences({
      clientName: "Ana Lucía",
      title: "Classic extensions",
      whenLabel: "Thu 24 Sep · 10:00",
      paidCents: 30000,
      currency: "MXN",
      cancelledBy: "talent",
    });
    assert.equal(c.refundKind, "full_talent");
    assert.equal(c.confirmKind, "refund");
    assert.equal(c.moneyLabel, "$300 MXN");
  });

  it("client cancel with deposit → rule-based refund", () => {
    const c = buildCancelConsequences({
      clientName: "Ana Lucía",
      title: "Classic extensions",
      whenLabel: "Thu 24 Sep · 10:00",
      paidCents: 30000,
      currency: "MXN",
      cancelledBy: "client",
    });
    assert.equal(c.refundKind, "rule_client");
    assert.equal(c.confirmKind, "plain");
  });

  it("no deposit → none", () => {
    const c = buildCancelConsequences({
      title: "Cut",
      whenLabel: "Fri 10:00",
      paidCents: 0,
      cancelledBy: "talent",
    });
    assert.equal(c.refundKind, "none");
    assert.equal(c.moneyLabel, null);
  });
});

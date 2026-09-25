import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { peekActionLabels, resolveAttentionCta } from "./attention-cta";
import type { TalentAgendaItem } from "./types";

function base(over: Partial<TalentAgendaItem>): TalentAgendaItem {
  return {
    id: "x",
    kind: "booking",
    ref: { table: "agency_bookings", id: "x" },
    title: "Session",
    lines: [],
    startsAt: "2026-09-24T15:00:00.000Z",
    endsAt: "2026-09-24T16:00:00.000Z",
    allDay: false,
    tz: "UTC",
    where: { mode: "studio", label: "Studio" },
    bufferAfterMin: 0,
    booking: "confirmed",
    payment: "none",
    money: { totalCents: 0, paidCents: 0, dueCents: 0, currency: "EUR" },
    source: "manual",
    blocksTime: true,
    history: [],
    ...over,
  };
}

describe("resolveAttentionCta", () => {
  it("replies to requests", () => {
    assert.equal(
      resolveAttentionCta(base({ kind: "request", booking: "requested" })).kind,
      "reply",
    );
  });
  it("releases holds", () => {
    assert.deepEqual(resolveAttentionCta(base({ kind: "hold", booking: "hold" })), {
      kind: "release_hold",
      label: "Release hold",
      mutates: true,
    });
  });
  it("collects overdue money", () => {
    assert.equal(
      resolveAttentionCta(
        base({
          payment: "overdue",
          money: { totalCents: 100, paidCents: 0, dueCents: 100, currency: "EUR" },
        }),
      ).kind,
      "collect",
    );
  });
  it("completes paid confirmed work", () => {
    assert.equal(
      resolveAttentionCta(
        base({
          booking: "confirmed",
          money: { totalCents: 50, paidCents: 50, dueCents: 0, currency: "EUR" },
        }),
      ).kind,
      "complete",
    );
  });
});

describe("peekActionLabels", () => {
  it("leads with release for holds", () => {
    assert.equal(peekActionLabels(base({ kind: "hold", booking: "hold" }))[0], "Release hold");
  });
});

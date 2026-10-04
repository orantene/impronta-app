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
  it("asks for a deposit on holds, never releases them", () => {
    const cta = resolveAttentionCta(base({ kind: "hold", booking: "hold" }));
    assert.deepEqual(cta, {
      kind: "request_deposit",
      label: "Request deposit",
      mutates: false,
    });
    assert.notEqual(cta.kind, "release_hold");
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
  it("reviews pending intake", () => {
    assert.deepEqual(
      resolveAttentionCta(
        base({
          tradeSection: { kind: "intake", payload: { status: "pending" } },
        }),
      ),
      { kind: "intake", label: "Review intake", mutates: false },
    );
  });
  it("responds to pending reschedule", () => {
    assert.equal(
      resolveAttentionCta(
        base({
          tradeSection: {
            kind: "event",
            payload: { rescheduleRequestId: "rr1", rescheduleStatus: "pending" },
          },
        }),
      ).kind,
      "reschedule",
    );
  });
  it("confirms transfer awaiting with mutating collect CTA", () => {
    assert.deepEqual(
      resolveAttentionCta(
        base({
          booking: "completed",
          payment: "awaiting",
          paymentMethod: "transfer",
          money: { totalCents: 100, paidCents: 0, dueCents: 100, currency: "MXN" },
        }),
      ),
      { kind: "collect", label: "Confirm transfer", mutates: true },
    );
  });

  it("does not offer Confirm transfer for card-awaiting", () => {
    const cta = resolveAttentionCta(
      base({
        booking: "completed",
        payment: "awaiting",
        paymentMethod: "card",
        money: { totalCents: 100, paidCents: 0, dueCents: 100, currency: "MXN" },
      }),
    );
    assert.notEqual(cta.label, "Confirm transfer");
    assert.equal(cta.mutates, false);
  });
});

describe("peekActionLabels", () => {
  it("leads with request deposit for holds and never offers release", () => {
    const labels = peekActionLabels(base({ kind: "hold", booking: "hold" }));
    assert.equal(labels[0], "Request deposit");
    assert.ok(!labels.includes("Release hold"));
  });
});

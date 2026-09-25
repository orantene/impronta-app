import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  blocksTime,
  deriveBookingState,
  derivePaymentState,
  formatCountdown,
  needsAttention,
  occupiedInterval,
  todayTotals,
  weekCounts,
} from "../derive";
import { JOR_CLOCK, JOR_DAY_KEY, JOR_WEEK } from "./jor-week";

describe("deriveBookingState", () => {
  it("maps request, hold, expired hold, completed, no_show", () => {
    assert.equal(
      deriveBookingState({ kind: "request", now: JOR_CLOCK }),
      "requested",
    );
    assert.equal(
      deriveBookingState({
        kind: "hold",
        holdUntil: "2026-09-23T11:40:00-05:00",
        now: JOR_CLOCK,
      }),
      "hold",
    );
    assert.equal(
      deriveBookingState({
        kind: "hold",
        holdUntil: "2026-09-23T09:00:00-05:00",
        now: JOR_CLOCK,
      }),
      "hold_expired",
    );
    assert.equal(
      deriveBookingState({ kind: "booking", status: "completed", now: JOR_CLOCK }),
      "completed",
    );
    assert.equal(
      deriveBookingState({ kind: "booking", status: "no_show", now: JOR_CLOCK }),
      "no_show",
    );
  });
});

describe("derivePaymentState", () => {
  it("completed + unpaid is overdue", () => {
    assert.equal(
      derivePaymentState({
        booking: "completed",
        paidCents: 0,
        totalCents: 62000,
        dueCents: 62000,
        now: JOR_CLOCK,
      }),
      "overdue",
    );
  });

  it("agency responsibility is agency", () => {
    assert.equal(
      derivePaymentState({
        booking: "confirmed",
        paidCents: 0,
        totalCents: 0,
        dueCents: 0,
        managedByAgency: true,
        now: JOR_CLOCK,
      }),
      "agency",
    );
  });

  it("partial when paid less than total", () => {
    assert.equal(
      derivePaymentState({
        booking: "confirmed",
        paidCents: 85000,
        totalCents: 180000,
        dueCents: 95000,
        now: JOR_CLOCK,
      }),
      "partial",
    );
  });
});

describe("jor week fixture numbers", () => {
  it("3 confirmed today = 285 minutes", () => {
    const t = todayTotals(JOR_WEEK, JOR_CLOCK, JOR_DAY_KEY);
    assert.equal(t.appointmentsToday, 3);
    assert.equal(t.bookedMinutes, 285);
  });

  it("still to collect includes due and overdue", () => {
    const t = todayTotals(JOR_WEEK, JOR_CLOCK, JOR_DAY_KEY);
    // 1050 + 950 + 620 (pesos as cents/100 in fixture we used *100) = 262000
    assert.equal(t.stillToCollectCents, 105000 + 95000 + 62000);
  });

  it("needs attention has 5 items", () => {
    const attn = needsAttention(JOR_WEEK, JOR_CLOCK);
    assert.equal(attn.length, 5);
  });

  it("week counts All 9 = 1+1+5+2+0", () => {
    const c = weekCounts(JOR_WEEK);
    assert.equal(c.requests, 1);
    assert.equal(c.onHold, 1);
    assert.equal(c.confirmed, 5);
    assert.equal(c.completed, 2);
    assert.equal(c.cancelled, 0);
    assert.equal(c.all, 9);
  });

  it("Sofia hold countdown is 1 h 50 from 09:50", () => {
    const hold = JOR_WEEK.find((i) => i.id === "jor-hold-sofia");
    assert.ok(hold?.holdUntil);
    assert.equal(formatCountdown(hold!.holdUntil!, JOR_CLOCK), "1 h 50");
  });
});

describe("blocksTime and occupiedInterval", () => {
  it("requests do not block", () => {
    const req = JOR_WEEK.find((i) => i.kind === "request")!;
    assert.equal(blocksTime(req), false);
  });

  it("includes buffer after in occupied interval", () => {
    const b = JOR_WEEK[0]!;
    const occ = occupiedInterval(b);
    assert.equal(occ.startsAt.toISOString(), new Date(b.startsAt).toISOString());
    assert.equal(
      occ.endsAt.getTime() - new Date(b.endsAt).getTime(),
      15 * 60_000,
    );
  });
});

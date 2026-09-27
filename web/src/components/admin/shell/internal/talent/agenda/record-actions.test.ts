import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { holdEndsParts, isCompletedUnpaid, recordActionVisibility } from "./record-actions";
import { shiftDays, weekDays, weekSubtitle } from "./present";

describe("P1 audit record states", () => {
  it("AUD-017a: completed + unpaid offers Request payment", () => {
    assert.equal(isCompletedUnpaid("completed", "awaiting_deposit"), true);
    assert.equal(isCompletedUnpaid("completed", "paid"), false);
    assert.equal(isCompletedUnpaid("confirmed", "awaiting_deposit"), false);
    const v = recordActionVisibility({ canAct: true, bookingState: "completed", paymentState: "overdue", started: true });
    assert.equal(v.requestPayment, true);
    const agency = recordActionVisibility({ canAct: true, isAgency: true, bookingState: "completed", paymentState: "overdue", started: true });
    assert.equal(agency.requestPayment, false);
  });

  it("AUD-017b: hold shows end time and time left", () => {
    const now = new Date(2026, 8, 27, 12, 0);
    assert.deepEqual(holdEndsParts(new Date(2026, 8, 27, 13, 50).toISOString(), now), { ends: "13:50", left: "1 h 50" });
    assert.deepEqual(holdEndsParts(new Date(2026, 8, 27, 12, 20).toISOString(), now), { ends: "12:20", left: "20 min" });
    assert.equal(holdEndsParts(new Date(2026, 8, 27, 11, 0).toISOString(), now)?.left, null);
    assert.equal(holdEndsParts("nope", now), null);
  });

  it("AUD-016: next week and subtitle", () => {
    const next = weekDays(shiftDays(new Date(2026, 8, 27, 9), 7));
    assert.equal(next[0].getDate(), 28);
    assert.match(weekSubtitle(next[0], 3, "en"), /^Week of .* · 3 bookings$/);
    assert.match(weekSubtitle(next[0], 1, "es"), /^Semana del .* · 1 cita$/);
  });
});

describe("recordActionVisibility (P0 audit)", () => {
  it("agency jobs hide every action except messaging", () => {
    const v = recordActionVisibility({
      canAct: true,
      isAgency: true,
      bookingState: "confirmed",
      paymentState: "awaiting_deposit",
      started: true,
    });
    assert.equal(v.talentOwnsActions, false);
    assert.equal(v.reschedule, false);
    assert.equal(v.cancel, false);
    assert.equal(v.noShow, false);
    assert.equal(v.collectDeposit, false);
    assert.equal(v.finishCollect, false);
    assert.equal(v.confirmTransfer, false);
  });

  it("finish and collect waits for the start time", () => {
    const before = recordActionVisibility({
      canAct: true,
      bookingState: "confirmed",
      started: false,
    });
    const after = recordActionVisibility({
      canAct: true,
      bookingState: "confirmed",
      started: true,
    });
    assert.equal(before.finishCollect, false);
    assert.equal(after.finishCollect, true);
  });

  it("does not offer reschedule for a request", () => {
    const v = recordActionVisibility({
      canAct: true,
      bookingState: "requested",
      started: false,
    });
    assert.equal(v.reschedule, false);
    assert.equal(v.finishCollect, false);
  });

  it("own confirmed booking keeps reschedule and deposit", () => {
    const v = recordActionVisibility({
      canAct: true,
      bookingState: "confirmed",
      paymentState: "awaiting_deposit",
      started: false,
    });
    assert.equal(v.reschedule, true);
    assert.equal(v.collectDeposit, true);
  });
});

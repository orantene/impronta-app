import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { recordActionVisibility } from "./record-actions";

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

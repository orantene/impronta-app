import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CONFIRMED_AGENCY_NOW_BODY,
  CONFIRMED_NOW_BODY,
  holdEndsParts,
  isCompletedUnpaid,
  nowBodyForRecord,
  placeLabelFor,
  recordActionVisibility,
  showMoreMenu,
  cancelConsequenceKeys,
  noShowMoneyKey,
} from "./record-actions";
import { agendaItemFromCalendarEntry, shiftDays, weekDays, weekSubtitle } from "./present";
import { buildAgendaListItemFromAgendaItem } from "./view-model";
import type { TalentCalendarEntry } from "../../data-bridge";

function entry(over: Partial<TalentCalendarEntry>): TalentCalendarEntry {
  return {
    id: "b1",
    kind: "booking",
    title: "Session",
    startsAt: "2026-09-27T15:00:00Z",
    endsAt: "2026-09-27T16:00:00Z",
    allDay: false,
    status: "confirmed",
    subLabel: "Ana",
    tenantId: null,
    ...over,
  } as TalentCalendarEntry;
}

describe("AUD-030/032 agenda record copy", () => {
  it("AUD-030: Where never prints a channel word as a place", () => {
    assert.equal(placeLabelFor({ mode: "studio", label: "Booking" }), undefined);
    assert.equal(placeLabelFor({ mode: "studio", label: "Booking" }, { hasStudio: true }), "At your studio");
    assert.equal(placeLabelFor({ mode: "away", label: "Av. Reforma 10" }), "Av. Reforma 10");
    assert.equal(placeLabelFor({ mode: "online", label: "" }), "Online");
    assert.equal(placeLabelFor({ mode: "studio", label: "Hold" }), undefined);
    const vm = buildAgendaListItemFromAgendaItem({
      ...agendaItemFromCalendarEntry(entry({})),
      where: { mode: "studio", label: "Booking" },
    });
    assert.equal(vm.whereLabel, "");
  });

  it("AUD-032: agency confirmed copy says the agency marks it complete", () => {
    assert.equal(nowBodyForRecord(CONFIRMED_NOW_BODY, true), CONFIRMED_AGENCY_NOW_BODY);
    assert.equal(nowBodyForRecord(CONFIRMED_NOW_BODY, false), CONFIRMED_NOW_BODY);
    assert.equal(CONFIRMED_AGENCY_NOW_BODY, "This booking is confirmed. The agency marks it complete.");
    const agency = buildAgendaListItemFromAgendaItem(agendaItemFromCalendarEntry(entry({ tenantId: "t1" })));
    assert.equal(agency.nowBody, CONFIRMED_AGENCY_NOW_BODY);
    const direct = buildAgendaListItemFromAgendaItem(agendaItemFromCalendarEntry(entry({})));
    assert.equal(direct.nowBody, CONFIRMED_NOW_BODY);
  });
});

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

describe("booking record mockup helpers", () => {
  it("cancel only on confirmed or held bookings", () => {
    const base = { canAct: true, started: false };
    assert.equal(recordActionVisibility({ ...base, bookingState: "confirmed" }).cancel, true);
    assert.equal(recordActionVisibility({ ...base, bookingState: "hold" }).cancel, true);
    assert.equal(recordActionVisibility({ ...base, bookingState: "cancelled" }).cancel, false);
    assert.equal(recordActionVisibility({ ...base, bookingState: "requested" }).cancel, false);
  });
  it("More is hidden for agency, requests and closed records", () => {
    assert.equal(showMoreMenu({ bookingState: "confirmed" }), true);
    assert.equal(showMoreMenu({ bookingState: "confirmed", isAgency: true }), false);
    assert.equal(showMoreMenu({ bookingState: "requested" }), false);
    assert.equal(showMoreMenu({ bookingState: "no_show" }), false);
  });
  it("cancel consequences lead with money", () => {
    // Ledger answered: it decides, whatever the chip says.
    assert.match(cancelConsequenceKeys("not_requested", "talent", 0)[0]!, /No payment/);
    assert.match(cancelConsequenceKeys("not_requested", "talent", 30000)[0]!, /not automatic.*Money/);
    assert.match(cancelConsequenceKeys("deposit_paid", "client", 5000)[0]!, /not automatic/);
    // Ledger not answered yet: never claim "No payment".
    assert.match(cancelConsequenceKeys("not_requested", "talent")[0]!, /Checking/);
    assert.match(cancelConsequenceKeys("not_requested", "talent", null)[0]!, /Checking/);
    assert.match(cancelConsequenceKeys("deposit_paid", "talent")[0]!, /not automatic/);
    for (const k of cancelConsequenceKeys("paid", "talent", 30000)) assert.doesNotMatch(k, /No payment|always goes back/);
  });
  it("no-show money line is honest", () => {
    assert.match(noShowMoneyKey("paid"), /stays as paid/);
    assert.match(noShowMoneyKey(undefined), /Nothing was paid/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { TalentAgendaItem } from "@/lib/talent-agenda/types";

import { buildAgendaListItemFromAgendaItem } from "./view-model";

function base(over: Partial<TalentAgendaItem> = {}): TalentAgendaItem {
  return {
    id: "bk-1",
    kind: "booking",
    ref: { table: "agency_bookings", id: "bk-1" },
    title: "Volume lashes",
    lines: [],
    startsAt: "2026-09-23T17:00:00.000Z",
    endsAt: "2026-09-23T19:15:00.000Z",
    tz: "America/Cancun",
    allDay: false,
    booking: "confirmed",
    payment: "partial",
    source: "manual",
    where: { mode: "studio", label: "Studio" },
    client: { name: "Ana López", initials: "AL" },
    money: { totalCents: 85000, paidCents: 20000, dueCents: 65000, currency: "MXN" },
    history: [],
    bufferAfterMin: 0,
    blocksTime: true,
    ...over,
  };
}

describe("buildAgendaListItemFromAgendaItem · pending reschedule", () => {
  it("exposes pendingReschedule and warn Now box when proposal is pending", () => {
    const item = buildAgendaListItemFromAgendaItem(
      base({
        tradeSection: {
          kind: "event",
          payload: {
            rescheduleRequestId: "rr-1",
            rescheduleStatus: "pending",
            newStartsAt: "2026-09-24T16:00:00.000Z",
            newEndsAt: "2026-09-24T18:15:00.000Z",
            feeCents: 0,
          },
        },
      }),
    );
    assert.equal(item.nowTitle, "Reschedule proposed");
    assert.equal(item.nowTone, "warn");
    assert.deepEqual(item.pendingReschedule, {
      requestId: "rr-1",
      newStartsAt: "2026-09-24T16:00:00.000Z",
      newEndsAt: "2026-09-24T18:15:00.000Z",
      feeCents: 0,
    });
  });

  it("keeps confirmed Now box when no pending reschedule", () => {
    const item = buildAgendaListItemFromAgendaItem(base());
    assert.equal(item.nowTitle, "Confirmed");
    assert.equal(item.pendingReschedule, null);
  });
});

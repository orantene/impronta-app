/**
 * B4 — talent agenda writers emit booking_activity_log via commercial-audit.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { summarizeCommercialEvent } from "@/lib/commercial-activity-summary";
import { BOOKING_AUDIT } from "@/lib/commercial-audit-events";
import { needsAttention } from "./derive";
import { resolveAttentionCta } from "./attention-cta";
import type { TalentAgendaItem } from "./types";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

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

describe("B4 activity log writers", () => {
  it("booking-actions imports logBookingActivity and BOOKING_AUDIT", () => {
    const src = readFileSync(path.join(ROOT, "booking-actions.ts"), "utf8");
    assert.match(src, /logBookingActivity/);
    assert.match(src, /BOOKING_AUDIT/);
    assert.match(src, /STATUS_CHANGED/);
    assert.match(src, /PAYMENT_STATE_CHANGED/);
    assert.match(src, /surface:\s*"talent_agenda"/);
  });

  it("reschedule-actions and cancel-actions write via commercial-audit", () => {
    const reschedule = readFileSync(path.join(ROOT, "reschedule-actions.ts"), "utf8");
    const cancel = readFileSync(path.join(ROOT, "cancel-actions.ts"), "utf8");
    assert.match(reschedule, /logBookingActivity/);
    assert.match(reschedule, /reschedule_proposed/);
    assert.match(reschedule, /reschedule_declined/);
    assert.match(reschedule, /kind:\s*"rescheduled"/);
    assert.match(cancel, /logBookingActivity/);
    assert.match(cancel, /to:\s*"cancelled"/);
  });

  it("load stops synthesizing Reschedule pending history text", () => {
    const src = readFileSync(path.join(ROOT, "load.ts"), "utf8");
    assert.doesNotMatch(src, /Reschedule pending\./);
    assert.match(src, /booking_activity_log/);
    assert.match(src, /summarizeCommercialEvent/);
    assert.match(src, /BOOKING_AUDIT\.STATUS_CHANGED/);
    assert.match(src, /BOOKING_AUDIT\.PAYMENT_STATE_CHANGED/);
    assert.match(src, /summary_lines\.filter/);
  });

  it("attention paths use tradeSection only for pending reschedule", () => {
    const now = new Date("2026-09-23T09:50:00-05:00");
    assert.equal(
      needsAttention(
        [baseBooking({ history: [{ at: now.toISOString(), text: "Reschedule pending." }] })],
        now,
      ).length,
      0,
    );
    const pending = baseBooking({
      tradeSection: {
        kind: "event",
        payload: { rescheduleRequestId: "rr1", rescheduleStatus: "pending" },
      },
    });
    assert.equal(needsAttention([pending], now).length, 1);
    assert.equal(resolveAttentionCta(pending).kind, "reschedule");
  });

  it("summarizeCommercialEvent labels talent reschedule kinds", () => {
    assert.equal(
      summarizeCommercialEvent(BOOKING_AUDIT.STATUS_CHANGED, { kind: "reschedule_proposed" }).label,
      "Reschedule proposed",
    );
    assert.equal(
      summarizeCommercialEvent(BOOKING_AUDIT.STATUS_CHANGED, {
        from: "confirmed",
        to: "no_show",
        surface: "talent_agenda",
      }).label,
      "Booking status changed",
    );
    assert.equal(
      summarizeCommercialEvent(BOOKING_AUDIT.PAYMENT_STATE_CHANGED, {
        payment_status: { from: "unpaid", to: "paid" },
        payment_method: { from: null, to: "cash" },
      }).label,
      "Payment details updated",
    );
  });
});

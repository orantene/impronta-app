/**
 * A3.1 — Real behavior tests (ownership gate, load-mapper transfer/deadline, mirror eq).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ownBookingGate, talentBookingMirrorEq } from "./ownership";
import { mapAgencyBookingPayment, mapDeliverableDeadline } from "./load-map";
import { derivePaymentState } from "./derive";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FINISH_UI = path.join(
  ROOT,
  "../../components/admin/shell/internal/talent/agenda/AgendaFinishCollect.tsx",
);

describe("A3.1 ownership — foreign bookingId → unauthorized", () => {
  it("rejects missing bookingId", () => {
    assert.deepEqual(
      ownBookingGate({
        bookingId: "",
        hasSessionUser: true,
        talentProfileId: "talent-1",
        onBookingTalent: true,
        ownsTalentBookingMirror: false,
      }),
      { ok: false, reason: "missing" },
    );
  });

  it("rejects no session / no talent profile", () => {
    assert.deepEqual(
      ownBookingGate({
        bookingId: "foreign-b1",
        hasSessionUser: false,
        talentProfileId: null,
        onBookingTalent: false,
        ownsTalentBookingMirror: false,
      }),
      { ok: false, reason: "unauthorized" },
    );
    assert.deepEqual(
      ownBookingGate({
        bookingId: "foreign-b1",
        hasSessionUser: true,
        talentProfileId: null,
        onBookingTalent: false,
        ownsTalentBookingMirror: false,
      }),
      { ok: false, reason: "unauthorized" },
    );
  });

  it("rejects foreign bookingId with neither leg nor mirror", () => {
    assert.deepEqual(
      ownBookingGate({
        bookingId: "someone-elses-booking",
        hasSessionUser: true,
        talentProfileId: "talent-1",
        onBookingTalent: false,
        ownsTalentBookingMirror: false,
      }),
      { ok: false, reason: "unauthorized" },
    );
  });

  it("allows booking_talent leg or talent_bookings mirror", () => {
    assert.deepEqual(
      ownBookingGate({
        bookingId: "b1",
        hasSessionUser: true,
        talentProfileId: "talent-1",
        onBookingTalent: true,
        ownsTalentBookingMirror: false,
      }),
      { ok: true, talentId: "talent-1" },
    );
    assert.deepEqual(
      ownBookingGate({
        bookingId: "b1",
        hasSessionUser: true,
        talentProfileId: "talent-1",
        onBookingTalent: false,
        ownsTalentBookingMirror: true,
      }),
      { ok: true, talentId: "talent-1" },
    );
  });
});

describe("A3.1 mirror scope — id + talent only", () => {
  it("talentBookingMirrorEq scopes by booking id and talent id", () => {
    assert.deepEqual(talentBookingMirrorEq("booking-9", "talent-2"), {
      id: "booking-9",
      talent_profile_id: "talent-2",
    });
  });

  it("booking-actions mirror updates use mirror eq helpers / id filters", () => {
    const src = readFileSync(path.join(ROOT, "booking-actions.ts"), "utf8");
    assert.match(src, /talentBookingMirrorEq/);
    assert.match(src, /ownBookingGate/);
    assert.doesNotMatch(src, /gte\("starts_at"/);
    assert.doesNotMatch(src, /lte\("starts_at"/);
  });
});

describe("A3.1 load-mapper — transfer ≠ overdue", () => {
  const now = new Date("2026-09-23T18:00:00-05:00");

  it("derive still keeps transfer awaiting after complete", () => {
    assert.equal(
      derivePaymentState({
        booking: "completed",
        paymentStatus: "unpaid",
        paymentMethod: "transfer",
        paidCents: 0,
        totalCents: 950_00,
        now,
      }),
      "awaiting",
    );
  });

  it("load-mapper with payment_method=transfer stays awaiting after complete", () => {
    const payment = mapAgencyBookingPayment({
      agencyStatus: "completed",
      talentBookingStatus: "completed",
      agency: {
        payment_status: "unpaid",
        payment_method: "transfer",
        total_client_revenue: 950_00,
        deposit_amount_cents: 0,
      },
      paidCents: 0,
      latestTxStatus: null,
      linkOpen: false,
      now,
      startsAt: "2026-09-23T10:00:00-05:00",
    });
    assert.equal(payment, "awaiting");
  });

  it("load-mapper without transfer marks completed unpaid as overdue", () => {
    const payment = mapAgencyBookingPayment({
      agencyStatus: "completed",
      talentBookingStatus: "completed",
      agency: {
        payment_status: "unpaid",
        payment_method: "cash",
        total_client_revenue: 950_00,
      },
      paidCents: 0,
      latestTxStatus: null,
      linkOpen: false,
      now,
      startsAt: "2026-09-23T10:00:00-05:00",
    });
    assert.equal(payment, "overdue");
  });
});

describe("A3.1 load-mapper — project deadline from due_at", () => {
  it("maps deliverable due_at into an all-day deadline item", () => {
    const item = mapDeliverableDeadline(
      {
        id: "del-1",
        booking_id: "b-project",
        title: "Final edit",
        due_at: "2026-09-25T15:00:00-05:00",
        status: "open",
      },
      "America/Cancun",
    );
    assert.ok(item);
    assert.equal(item!.kind, "deadline");
    assert.equal(item!.id, "deadline-del-1");
    assert.equal(item!.allDay, true);
    assert.equal(item!.blocksTime, false);
    assert.equal(item!.title, "Final edit");
    assert.equal(item!.tradeSection?.kind, "estimate");
    assert.equal(item!.tradeSection?.payload.bookingId, "b-project");
    assert.equal(item!.tz, "America/Cancun");
  });

  it("returns null when due_at missing or invalid", () => {
    assert.equal(
      mapDeliverableDeadline(
        { id: "x", booking_id: "b", title: "T", due_at: "", status: null },
        "UTC",
      ),
      null,
    );
    assert.equal(
      mapDeliverableDeadline(
        { id: "x", booking_id: "b", title: "T", due_at: "not-a-date", status: null },
        "UTC",
      ),
      null,
    );
  });
});

describe("A3.1 adjust lines — UI absence", () => {
  it("FinishCollect does not offer adjust-lines", () => {
    const ui = readFileSync(FINISH_UI, "utf8");
    assert.doesNotMatch(ui, /Adjust lines/i);
    assert.doesNotMatch(ui, /adjustLines/);
  });
});

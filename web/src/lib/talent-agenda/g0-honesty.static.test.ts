/**
 * G0.1 / G0.3 — static contracts for create-slot and HoldFlows wiring.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)));

describe("G0.1 createOwnSlotBooking", () => {
  const src = readFileSync(path.join(ROOT, "create-slot.ts"), "utf8");

  it("writes agency_bookings and booking_talent, not only talent_bookings", () => {
    assert.ok(src.includes('.from("agency_bookings")'));
    assert.ok(src.includes('.from("booking_talent")'));
    assert.ok(src.includes('.from("talent_bookings")'));
    assert.ok(src.includes("id: bookingId"), "calendar row shares commercial id");
  });

  it("honors paymentChoice instead of voiding it", () => {
    assert.ok(!/void\s+input\.paymentChoice/.test(src));
    assert.ok(src.includes("paymentStatusFor"));
    assert.ok(src.includes('payment_status: paymentStatus'));
  });

  it("reads buffer_after_min from talent_booking_hours", () => {
    assert.ok(src.includes("buffer_after_min"));
    assert.ok(src.includes("readBufferAfterMs"));
  });
});

describe("G0.2–G0.3 HoldFlows + convert", () => {
  const flows = readFileSync(
    path.join(
      ROOT,
      "../../components/admin/shell/internal/talent/agenda/AgendaHoldFlows.tsx",
    ),
    "utf8",
  );
  const convert = readFileSync(path.join(ROOT, "convert-hold.ts"), "utf8");

  it("HoldFlows uses convertOwnTalentHold and releaseOwnTalentHold", () => {
    assert.ok(flows.includes("convertOwnTalentHold"));
    assert.ok(flows.includes("releaseOwnTalentHold"));
    assert.ok(!flows.includes("cancelBookingWithRefund"));
    assert.ok(!flows.includes("Engine wiring in progress"));
  });

  it("convertOwnTalentHold creates commercial + calendar then deletes hold", () => {
    assert.ok(convert.includes('.from("agency_bookings")'));
    assert.ok(convert.includes('.from("talent_bookings")'));
    assert.ok(convert.includes('.from("talent_holds")'));
    assert.ok(convert.includes(".delete()"));
  });
});

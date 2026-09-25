/**
 * G0.1 / G0.3 / B1 / B3 — static contracts for create-slot and HoldFlows wiring.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)));

describe("G0.1 createOwnSlotBooking", () => {
  const src = blankComments(readFileSync(path.join(ROOT, "create-slot.ts"), "utf8"));

  it("writes agency_bookings and booking_talent, not only talent_bookings", () => {
    assert.ok(src.includes('.from("agency_bookings")'));
    assert.ok(src.includes('.from("booking_talent")'));
    assert.ok(src.includes('.from("talent_bookings")'));
    assert.ok(src.includes("id: bookingId"), "calendar row shares commercial id");
  });

  it("uses hub seller tenant, not agency roster gate", () => {
    assert.ok(src.includes("resolveTalentOwnWorkTenant"));
    assert.ok(src.includes("loadTalentActor"));
    assert.ok(!src.includes("getActiveTalentAgencyContext"));
    assert.ok(!src.includes('"no_agency"'));
  });

  it("opens draft order + lines after booking insert (B3)", () => {
    assert.ok(src.includes("openBookingOrderForAgenda"));
    assert.ok(src.includes("offeringId"));
  });

  it("honors paymentChoice instead of voiding it", () => {
    assert.ok(!/void\s+input\.paymentChoice/.test(src));
    assert.ok(src.includes("paymentStatusFor("));
    assert.ok(src.includes('payment_status: paymentStatus'));
  });

  it("reads buffer_after_min from talent_booking_hours", () => {
    assert.ok(src.includes('.select("buffer_after_min")'));
    assert.ok(src.includes("readBufferAfterMs("));
  });
});

describe("B3 openBookingOrderForAgenda", () => {
  const src = blankComments(readFileSync(path.join(ROOT, "open-booking-order.ts"), "utf8"));

  it("reuses POS createDraftOrder / addLine / addCustomLine", () => {
    assert.ok(src.includes("createDraftOrder"));
    assert.ok(src.includes("addLine"));
    assert.ok(src.includes("addCustomLine"));
    assert.ok(src.includes('sourceChannel: "talent_agenda"'));
  });

  it("links agency_bookings.order_id and writes major-unit revenue", () => {
    assert.ok(src.includes("order_id:"));
    assert.ok(src.includes("total_client_revenue"));
    assert.ok(src.includes("centsToTotalClientRevenue"));
  });
});

describe("G0.2–G0.3 HoldFlows + convert", () => {
  const flows = blankComments(
    readFileSync(
      path.join(
        ROOT,
        "../../components/admin/shell/internal/talent/agenda/AgendaHoldFlows.tsx",
      ),
      "utf8",
    ),
  );
  const convert = blankComments(readFileSync(path.join(ROOT, "convert-hold.ts"), "utf8"));

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
    assert.ok(convert.includes("resolveTalentOwnWorkTenant"));
    assert.ok(!convert.includes("getActiveTalentAgencyContext"));
    assert.ok(convert.includes("openBookingOrderForAgenda"));
  });
});

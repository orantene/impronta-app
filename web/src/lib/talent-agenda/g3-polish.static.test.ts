/**
 * G3 — static contracts for TradeSections, no-show gate, TaskShell flows.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const AGENDA = path.join(ROOT, "../../components/admin/shell/internal/talent/agenda");

describe("G3.1–G3.4 polish contracts", () => {
    it("BookingRecord uses TradeSections and gates no-show", () => {
    const src = readFileSync(path.join(AGENDA, "AgendaBookingRecord.tsx"), "utf8");
    assert.ok(src.includes("<TradeSections"));
    assert.ok(!src.includes("function TradeSection("));
    assert.ok(src.includes("Available after the start time"));
    assert.ok(src.includes("!noShowReady"));
  });

  it("Intake Resend is hidden without resendUrl", () => {
    const src = readFileSync(path.join(AGENDA, "TradeSections.tsx"), "utf8");
    assert.ok(src.includes("d.resendUrl ?"));
    assert.ok(!src.includes("Resend when a form link exists"));
  });

  it("Finish/Hold/Pay/Reschedule/New/Quotes/Rebook use TaskShell", () => {
    for (const file of [
      "AgendaFinishCollect.tsx",
      "AgendaHoldFlows.tsx",
      "AgendaPayRequest.tsx",
      "AgendaRescheduleSheet.tsx",
      "AgendaNewBooking.tsx",
      "AgendaQuotes.tsx",
      "AgendaRebookSuggestion.tsx",
    ]) {
      const src = readFileSync(path.join(AGENDA, file), "utf8");
      assert.ok(src.includes("<TaskShell"), file);
      assert.ok(src.includes("useAgendaCopy("), file);
    }
  });
});

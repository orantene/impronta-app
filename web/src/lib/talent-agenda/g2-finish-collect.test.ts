import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { derivePaymentState } from "./derive";

const root = join(process.cwd(), "src/lib/talent-agenda");

describe("G2.1 finish-collect honesty", () => {
  it("transfer awaiting is awaiting after complete, not overdue", () => {
    const now = new Date("2026-09-23T18:00:00-05:00");
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
    assert.equal(
      derivePaymentState({
        booking: "completed",
        paymentStatus: "unpaid",
        paidCents: 0,
        totalCents: 950_00,
        now,
      }),
      "overdue",
    );
  });

  it("booking-actions expose transfer + pay-link writers", () => {
    const src = readFileSync(join(root, "booking-actions.ts"), "utf8");
    assert.match(src, /recordBookingTransferAwaiting/);
    assert.match(src, /markBookingTransferReceived/);
    assert.match(src, /createAgendaBookingPayLink/);
    assert.match(src, /payment_method:\s*"transfer"/);
    assert.match(src, /createPaymentLink/);
  });

  it("FinishCollect wires cash, transfer, and card paths", () => {
    const src = readFileSync(
      join(
        process.cwd(),
        "src/components/admin/shell/internal/talent/agenda/AgendaFinishCollect.tsx",
      ),
      "utf8",
    );
    assert.match(src, /recordBookingTransferAwaiting/);
    assert.match(src, /createAgendaBookingPayLink/);
    assert.match(src, /recordBookingCashCollected/);
    assert.match(src, /no_order|No order/);
  });
});

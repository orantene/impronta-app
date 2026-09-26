import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { derivePaymentState } from "./derive";

const root = join(process.cwd(), "src/lib/talent-agenda");

describe("G2.1 / A0 finish-collect honesty", () => {
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

  it("booking-actions require ownership and scope calendar mirrors by id", () => {
    const src = readFileSync(join(root, "booking-actions.ts"), "utf8");
    const ownership = readFileSync(join(root, "ownership.ts"), "utf8");
    assert.match(ownership, /reason: "unauthorized"/);
    assert.match(src, /ownBookingGate/);
    assert.match(src, /if \(!own\.ok\) return own;/);
    assert.match(src, /requireOwnBooking/);
    assert.match(src, /talentBookingMirrorEq/);
    assert.match(src, /recordBookingTransferAwaiting/);
    assert.match(src, /markBookingTransferReceived/);
    assert.match(src, /createAgendaBookingPayLink/);
    assert.match(src, /payment_method:\s*"transfer"/);
    assert.match(src, /createPaymentLink/);
    assert.match(src, /\.eq\("id",\s*(input\.bookingId|mirror\.id)\)/);
    assert.doesNotMatch(src, /gte\("starts_at"/);
    assert.doesNotMatch(src, /void input\.adjustLines/);
  });

  it("FinishCollect wires cash, transfer, and card paths without adjust-lines theater", () => {
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
    assert.match(src, /Card needs an amount due/);
    assert.match(src, /invalid_amount/);
    assert.doesNotMatch(src, /Card needs a linked order/);
    assert.doesNotMatch(src, /Adjust lines/);
    assert.doesNotMatch(src, /adjustLines/);
  });

  it("createAgendaBookingPayLink ensures an order shell when missing", () => {
    const src = readFileSync(join(root, "booking-actions.ts"), "utf8");
    assert.match(src, /ensureAgendaOrderShell/);
    assert.match(src, /source_channel:\s*"talent_agenda"/);
    assert.match(src, /guest_session_id/);
    assert.match(src, /ensureCustomer/);
    assert.doesNotMatch(src, /reason:\s*"no_order"/);
  });

  it("createAgendaBookingPayLink rewrites app origin onto a tenant /pay host", () => {
    const src = readFileSync(join(root, "booking-actions.ts"), "utf8");
    assert.match(src, /resolveAgendaPayPublicOrigin/);
    assert.match(src, /pay-public-origin/);
    // Must not pass a raw window origin straight into createPaymentLink.
    assert.doesNotMatch(
      src,
      /createPaymentLink\([\s\S]*publicOrigin:\s*input\.publicOrigin\.replace/,
    );
  });

  it("ensureAgendaOrderShell aligns a short unpaid talent_agenda shell before mint", () => {
    const src = readFileSync(join(root, "booking-actions.ts"), "utf8");
    assert.match(src, /alignAgendaOrderShellToAmount/);
    assert.match(src, /currentTotal >= input\.amountCents/);
    assert.match(src, /state", "reserved"/);
    // Must grow the shell to the owed mint amount — never zero it out.
    assert.doesNotMatch(src, /total_cents:\s*0/);
  });

  it("New booking request_link copy does not claim a link was created", () => {
    const ui = readFileSync(
      join(
        process.cwd(),
        "src/components/admin/shell/internal/talent/agenda/AgendaNewBooking.tsx",
      ),
      "utf8",
    );
    assert.match(ui, /Collect later \(no link yet\)/);
    assert.match(ui, /Does not create a pay link/);
    assert.doesNotMatch(ui, /\["request_link", "Request a payment link"\]/);
  });
});

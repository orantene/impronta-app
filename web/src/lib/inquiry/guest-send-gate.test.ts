/**
 * UNIT TEST — guest-send-gate.ts (P0-6, message-panel wave W0-D).
 *
 * Pins the placeholder-contact send gate: sendGuestMessageAction used to
 * insert the guest's message BEFORE checking whether the target inquiry's
 * contact was still the synthetic seed placeholder, so a call that bypassed
 * the client's promote-then-send flow could durably write a message into a
 * hidden draft with an unreachable contact. Covered here:
 *   (a) draft + seed contact (various shapes) → refused
 *   (b) draft + real contact → proceeds
 *   (c) non-draft (submitted / any other status) → proceeds regardless of
 *       contact shape (untouched — a non-draft inquiry was already reachable
 *       when it left `draft`)
 *   (d) isSeedContact edge cases — case sensitivity, whitespace, the "real
 *       guest literally named Guest" carve-out, null/undefined inputs
 *
 * Run: npx tsx --test src/lib/inquiry/guest-send-gate.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { isSeedContact, shouldRefuseGuestSend } from "./guest-send-gate";

const SEED_EMAIL = "pending-session-abc123@guest.impronta";

describe("isSeedContact", () => {
  it("reports the canonical early-row seed (name 'Guest' + pending email) as seed", () => {
    assert.equal(isSeedContact("Guest", SEED_EMAIL), true);
  });

  it("reports a pending email as seed even if the name was edited", () => {
    assert.equal(isSeedContact("Someone Else", SEED_EMAIL), true);
  });

  it("is case-insensitive on the pending-email shape", () => {
    assert.equal(isSeedContact("Guest", "PENDING-SESSION-ABC123@GUEST.IMPRONTA"), true);
  });

  it("reports name 'Guest' + empty email as seed (pre-ContactCard placeholder)", () => {
    assert.equal(isSeedContact("Guest", ""), true);
    assert.equal(isSeedContact("Guest", null), true);
    assert.equal(isSeedContact("Guest", undefined), true);
  });

  it("treats whitespace-only name/email the same as empty", () => {
    assert.equal(isSeedContact("  Guest  ", "   "), true);
  });

  it("does NOT flag a real guest literally named 'Guest' who already has a real email", () => {
    assert.equal(isSeedContact("Guest", "guest@realmail.com"), false);
  });

  it("does NOT flag a real contact with a real name + real email", () => {
    assert.equal(isSeedContact("Jane Doe", "jane@example.com"), false);
  });

  it("does NOT flag an email that merely contains 'pending-' mid-string or the wrong domain", () => {
    assert.equal(isSeedContact("Jane Doe", "not-pending-jane@example.com"), false);
    assert.equal(isSeedContact("Jane Doe", "pending-jane@example.com"), false); // wrong domain
    assert.equal(isSeedContact("Jane Doe", "pending-jane@guest.impronta.com"), false); // wrong suffix
  });

  it("handles null/undefined contactName gracefully", () => {
    assert.equal(isSeedContact(null, "jane@example.com"), false);
    assert.equal(isSeedContact(undefined, SEED_EMAIL), true);
  });
});

describe("shouldRefuseGuestSend", () => {
  it("(a) refuses: draft + seed contact + no promotion carried by the call", () => {
    assert.equal(
      shouldRefuseGuestSend({ status: "draft", contactName: "Guest", contactEmail: SEED_EMAIL }),
      true,
    );
  });

  it("(a) refuses: draft + freshly-inserted seed row (name Guest, empty email)", () => {
    assert.equal(
      shouldRefuseGuestSend({ status: "draft", contactName: "Guest", contactEmail: "" }),
      true,
    );
  });

  it("(b) proceeds: draft + real (promoted) contact", () => {
    assert.equal(
      shouldRefuseGuestSend({
        status: "draft",
        contactName: "Jane Doe",
        contactEmail: "jane@example.com",
      }),
      false,
    );
  });

  it("(c) proceeds: submitted inquiry, regardless of contact shape", () => {
    assert.equal(
      shouldRefuseGuestSend({ status: "submitted", contactName: "Guest", contactEmail: SEED_EMAIL }),
      false,
    );
    assert.equal(
      shouldRefuseGuestSend({
        status: "submitted",
        contactName: "Jane Doe",
        contactEmail: "jane@example.com",
      }),
      false,
    );
  });

  it("(c) proceeds: every other non-draft lifecycle status, even with a seed contact", () => {
    for (const status of ["offer_pending", "approved", "qualified", "booked", "converted", "closed"]) {
      assert.equal(
        shouldRefuseGuestSend({ status, contactName: "Guest", contactEmail: SEED_EMAIL }),
        false,
        `expected status=${status} to proceed`,
      );
    }
  });

  it("(d) null/null on a draft does NOT read as seed by name/email shape alone — the caller " +
    "(guest-chat-actions.ts) guards this separately: contact_name/contact_email are NOT NULL " +
    "DB columns, so null here can only mean 'no row was found', which the caller treats as " +
    "not_found BEFORE ever calling this predicate. Documented so a future change to that " +
    "caller-side guard doesn't silently reopen the gap.", () => {
    assert.equal(
      shouldRefuseGuestSend({ status: "draft", contactName: null, contactEmail: null }),
      false,
    );
  });
});

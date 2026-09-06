import test from "node:test";
import assert from "node:assert/strict";

import { guestHeaderThreadState, isPrivateDraftThread } from "./guest-thread-state";

/**
 * Measured on the live inquiry: the panel rendered "Not sent yet" directly
 * ABOVE "Inquiry received", while the database said `status='submitted'` and
 * `inquiry_drafts` held zero rows platform-wide.
 */

const SUBMITTED = {
  extrasEnabled: true,
  inquiryRecordExists: true,
  // The exact production shape: the contact details still LOOK like seed
  // placeholders, which is the only thing the old predicate consulted.
  contactPromoted: false,
  hasReceipt: true,
  showGate: false,
  showSentAirlock: false,
};

test("a submitted inquiry is never a draft, whatever its contact looks like", () => {
  assert.equal(isPrivateDraftThread(SUBMITTED), false);
  assert.equal(guestHeaderThreadState(SUBMITTED), "sent");
});

test("the exact production state that rendered 'Not sent yet' over a receipt", () => {
  // The whole defect in one assertion: a receipt and a draft line cannot both
  // be true. If this ever returns "draft" again, a client is being told their
  // sent inquiry was not sent, on the same screen that confirms it was.
  assert.notEqual(guestHeaderThreadState(SUBMITTED), "draft");
});

test("a real draft is still a draft — this did not just delete the state", () => {
  // The mirror. Removing the false draft must not remove the true one: a guest
  // mid-compose still needs the banner and the "Send to agency" affordance.
  const drafting = { ...SUBMITTED, hasReceipt: false };
  assert.equal(isPrivateDraftThread(drafting), true);
  assert.equal(guestHeaderThreadState(drafting), "draft");
});

test("a guest who has started nothing is 'new', not 'sent'", () => {
  // Three states, not two. Reporting an empty panel as "Sent, awaiting reply"
  // would be a flat lie about what the agency has.
  const fresh = { ...SUBMITTED, inquiryRecordExists: false, hasReceipt: false };
  assert.equal(guestHeaderThreadState(fresh), "new");
});

test("a promoted contact still reads as sent without a receipt", () => {
  // The pre-existing path must survive: `contactPromoted` alone was the old
  // definition of sent, and a thread that reached the agency before receipts
  // existed must not regress to "new".
  const promoted = { ...SUBMITTED, contactPromoted: true, hasReceipt: false };
  assert.equal(guestHeaderThreadState(promoted), "sent");
});

test("the gate and the airlock still own the surface", () => {
  for (const key of ["showGate", "showSentAirlock"] as const) {
    const during = { ...SUBMITTED, hasReceipt: false, [key]: true };
    assert.equal(isPrivateDraftThread(during), false, `${key} must suppress the draft banner`);
  }
});

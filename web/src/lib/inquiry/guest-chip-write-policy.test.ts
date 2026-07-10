/**
 * UNIT TEST — guest-chip-write-policy.ts (freeze on send, decision D3 / P0-3).
 *
 * Pins the allowlist that captureGuestChip reads before mutating an inquiry's
 * structured spine: ONLY a `draft` inquiry is writable; every sent/live status
 * (canonical + legacy) is frozen. This is the regression guard for the P0 where a
 * guest could keep editing an already-`submitted` inquiry because the old code
 * refused only a hand-maintained TERMINAL set.
 *
 * Run: npx tsx --test src/lib/inquiry/guest-chip-write-policy.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { CANONICAL_STATUSES, LEGACY_STATUSES } from "./inquiry-lifecycle";
import {
  GUEST_CHIP_WRITABLE_STATUS,
  isGuestChipWritableStatus,
} from "./guest-chip-write-policy";

describe("guest chip write policy — freeze on send (D3)", () => {
  it("allows a write to a DRAFT inquiry", () => {
    assert.equal(isGuestChipWritableStatus("draft"), true);
    assert.equal(GUEST_CHIP_WRITABLE_STATUS, "draft");
  });

  it("REFUSES a write to a submitted (sent) inquiry — the P0-3 regression", () => {
    // The pre-fix bug: `submitted` was not in the terminal blocklist, so a guest
    // could keep editing an already-sent inquiry. It must now be refused.
    assert.equal(isGuestChipWritableStatus("submitted"), false);
  });

  it("REFUSES a write to a terminal inquiry (booked / archived / rejected / expired)", () => {
    for (const status of ["booked", "archived", "rejected", "expired"]) {
      assert.equal(
        isGuestChipWritableStatus(status),
        false,
        `${status} must be frozen`,
      );
    }
  });

  it("refuses EVERY non-draft canonical status, allows only draft", () => {
    for (const status of CANONICAL_STATUSES) {
      const expected = status === "draft";
      assert.equal(
        isGuestChipWritableStatus(status),
        expected,
        `canonical status ${status} writable should be ${expected}`,
      );
    }
  });

  it("refuses EVERY legacy status (none of them is a pre-send draft)", () => {
    for (const status of LEGACY_STATUSES) {
      assert.equal(
        isGuestChipWritableStatus(status),
        false,
        `legacy status ${status} must be frozen`,
      );
    }
  });

  it("fails closed on null / undefined / unknown status", () => {
    assert.equal(isGuestChipWritableStatus(null), false);
    assert.equal(isGuestChipWritableStatus(undefined), false);
    assert.equal(isGuestChipWritableStatus(""), false);
    assert.equal(isGuestChipWritableStatus("DRAFT"), false); // case-sensitive
    assert.equal(isGuestChipWritableStatus("not_a_status"), false);
  });
});

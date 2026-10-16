/**
 * UNIT TEST: recipient normalization for the email sender (TUL-741).
 *
 * Resend rejects the whole send with "Invalid `to` field" for a padded,
 * empty, null or malformed address. The sender must trim, drop and report
 * those instead of calling the provider, and must say why it skipped.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { normalizeRecipients } from "./recipient-address";
import { sendEmailResult } from "./index";

describe("normalizeRecipients", () => {
  it("trims padded addresses", () => {
    assert.deepEqual(normalizeRecipients("  a@gmail.com \n"), { valid: ["a@gmail.com"], invalid: 0 });
  });

  it("drops empty, malformed and multi-address strings and counts them", () => {
    const out = normalizeRecipients(["", "   ", "nope", "a@b", "a@b.com, c@d.com", "ok@x.com"]);
    assert.deepEqual(out.valid, ["ok@x.com"]);
    assert.equal(out.invalid, 5);
  });

  it("keeps the display-name form and dedupes case-insensitively", () => {
    const out = normalizeRecipients(["Ana <Ana@X.com>", "ana@x.com", "ANA@x.com"]);
    assert.deepEqual(out.valid, ["Ana <Ana@X.com>"]);
  });

  it("tolerates null and undefined entries", () => {
    const out = normalizeRecipients([null, undefined, "a@b.co"] as unknown as string[]);
    assert.deepEqual(out, { valid: ["a@b.co"], invalid: 2 });
  });
});

describe("sendEmailResult with no valid recipient", () => {
  it("skips with invalid_address and never reaches the provider", async () => {
    for (const to of ["", "   ", "not-an-email", ["", "x"]]) {
      const r = await sendEmailResult({ to, subject: "s", html: "<p>h</p>" });
      assert.deepEqual(r, { status: "skipped", reason: "invalid_address" }, JSON.stringify(to));
    }
  });
});

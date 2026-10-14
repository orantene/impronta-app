import assert from "node:assert/strict";
import { test } from "node:test";

import { sanitizeGuestPhone } from "./guest-phone";

test("TUL-897: letters and symbols never reach the phone value", () => {
  assert.equal(sanitizeGuestPhone("55 abc 1234-5678"), "55 1234 5678");
  assert.equal(sanitizeGuestPhone("+52 (55) 1234"), "+52 55 1234");
  assert.equal(sanitizeGuestPhone("hola"), "");
  assert.equal(sanitizeGuestPhone("52+55+"), "5255", "a plus only counts in front");
  assert.equal(sanitizeGuestPhone("  +1  555"), "+1 555");
});

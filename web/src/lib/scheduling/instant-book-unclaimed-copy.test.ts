import test from "node:test";
import assert from "node:assert/strict";

import { localizedBookingRefusal } from "./instant-book-refusal-copy";

// TUL-1260: the unclaimed-profile refusal follows the page language.
test("unclaimed_seller refusal is Spanish on an ES page and English otherwise", () => {
  const es = localizedBookingRefusal("unclaimed_seller", "es", "This profile cannot take money until it is claimed.");
  const en = localizedBookingRefusal("unclaimed_seller", "en", "fallback");
  assert.match(es ?? "", /Este perfil/);
  assert.doesNotMatch(es ?? "", /cannot take money/);
  assert.match(en ?? "", /online bookings/);
});

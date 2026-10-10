import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isTalentBookingAliasPath,
  talentBookingSheetRedirectPath,
  TALENT_BOOKING_ALIAS_SLUGS,
} from "./talent-site-booking-alias";

test("isTalentBookingAliasPath: /agendar and /book only", () => {
  assert.equal(isTalentBookingAliasPath("/agendar"), true);
  assert.equal(isTalentBookingAliasPath("/book"), true);
  assert.equal(isTalentBookingAliasPath("/en/book"), false);
  assert.equal(isTalentBookingAliasPath("/reservar"), false);
  assert.equal(isTalentBookingAliasPath("/"), false);
});

test("talentBookingSheetRedirectPath: primary ES → /#book; EN → /en#book", () => {
  assert.equal(talentBookingSheetRedirectPath("es", "es", ["es", "en"]), "/#book");
  assert.equal(talentBookingSheetRedirectPath("en", "es", ["es", "en"]), "/en#book");
});

test("TALENT_BOOKING_ALIAS_SLUGS lists both public words", () => {
  assert.deepEqual([...TALENT_BOOKING_ALIAS_SLUGS].sort(), ["agendar", "book"]);
});

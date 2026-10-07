import assert from "node:assert/strict";
import test from "node:test";

import { parseGuestOrderQuery } from "./guest-order-resume";

test("parseGuestOrderQuery accepts a uuid", () => {
  assert.equal(
    parseGuestOrderQuery("33330031-0000-4000-8000-0000000000b1"),
    "33330031-0000-4000-8000-0000000000b1",
  );
});

test("parseGuestOrderQuery rejects junk", () => {
  assert.equal(parseGuestOrderQuery(null), null);
  assert.equal(parseGuestOrderQuery(""), null);
  assert.equal(parseGuestOrderQuery("not-a-uuid"), null);
  assert.equal(parseGuestOrderQuery("abc"), null);
  assert.equal(parseGuestOrderQuery("  "), null);
});

import { decideOrderResume } from "./guest-order-resume";

const OID = "33330031-0000-4000-8000-0000000000b1";

test("decideOrderResume opens only for the owning session", () => {
  assert.equal(decideOrderResume({ parsedOrderId: OID, guestSessionId: "s1", inquiryId: "i1", inquiryGuestSessionId: "s1" }), "open");
});

test("decideOrderResume falls back safely otherwise", () => {
  assert.equal(decideOrderResume({ parsedOrderId: null, guestSessionId: "s1", inquiryId: "i1", inquiryGuestSessionId: "s1" }), "fallback");
  assert.equal(decideOrderResume({ parsedOrderId: OID, guestSessionId: null, inquiryId: "i1", inquiryGuestSessionId: "s1" }), "fallback");
  assert.equal(decideOrderResume({ parsedOrderId: OID, guestSessionId: "s2", inquiryId: "i1", inquiryGuestSessionId: "s1" }), "fallback");
  assert.equal(decideOrderResume({ parsedOrderId: OID, guestSessionId: "s1", inquiryId: null, inquiryGuestSessionId: null }), "fallback");
});

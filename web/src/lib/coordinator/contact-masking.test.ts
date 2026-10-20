import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTACT_MASKING_FLAG,
  contactMaskingEnabled,
  maskContactDetails,
  shouldMaskContacts,
  type TermsForMasking,
} from "./contact-masking";

test("emails are masked, in a sentence, with plus tags and subdomains", () => {
  const r = maskContactDetails("Write me at ana.ruiz+jobs@mail.studio.co or ANA@GMAIL.COM please");
  assert.equal(r.text, "Write me at [email hidden] or [email hidden] please");
  assert.equal(r.maskedCount, 2);
});

test("phones are masked in the usual shapes", () => {
  for (const p of ["+52 984 123 4567", "984-123-4567", "(984) 123 4567", "+1 (415) 555-0132", "9841234567", "+34 612 345 678", "984.123.4567"]) {
    const r = maskContactDetails(`call ${p} tomorrow`);
    assert.equal(r.text, "call [phone hidden] tomorrow", p);
    assert.equal(r.maskedCount, 1, p);
  }
});

test("wa.me links are masked", () => {
  const r = maskContactDetails("or https://wa.me/529841234567?text=hi");
  assert.match(r.text, /\[phone hidden\]/);
  assert.ok(!r.text.includes("5298412"));
});

test("prices, dates, times, counts and ids are left alone", () => {
  for (const s of [
    "Total $12,000,000 MXN",
    "Total 1,200.50 USD",
    "On 2026-11-10 at 15:30",
    "10/11/2026 18:00-21:00",
    "3 guests, 2 hours, 1 car",
    "Order 12345 confirmed",
    "Budget 50000",
    "Booking ref 20261110",
  ]) {
    const r = maskContactDetails(s);
    assert.equal(r.text, s, s);
    assert.equal(r.maskedCount, 0, s);
  }
});

test("obfuscated emails written with 'at' and 'dot' are masked; ordinary words are not", () => {
  assert.equal(maskContactDetails("ana at gmail dot com").text, "[email hidden]");
  assert.equal(maskContactDetails("ana (at) gmail (dot) com").text, "[email hidden]");
  assert.equal(maskContactDetails("look at the dot on the map").text, "look at the dot on the map");
});

test("masking is idempotent and empty text is empty", () => {
  const once = maskContactDetails("ana@x.com 984 123 4567").text;
  assert.equal(maskContactDetails(once).text, once);
  assert.deepEqual(maskContactDetails(""), { text: "", maskedCount: 0 });
});

const terms = (over: Partial<TermsForMasking>): TermsForMasking => ({ showContact: false, clientContact: "workspace", ...over });

test("mask before booking when any lineup person's terms keep contact with the workspace", () => {
  assert.equal(shouldMaskContacts({ terms: [terms({})], hasConfirmedBooking: false }), true);
  assert.equal(shouldMaskContacts({ terms: [terms({ showContact: true, clientContact: "talent" }), terms({})], hasConfirmedBooking: false }), true);
});

test("no masking once booked, when contact is allowed, or when there are no terms", () => {
  assert.equal(shouldMaskContacts({ terms: [terms({})], hasConfirmedBooking: true }), false);
  assert.equal(shouldMaskContacts({ terms: [terms({ showContact: true, clientContact: "talent" })], hasConfirmedBooking: false }), false);
  assert.equal(shouldMaskContacts({ terms: [], hasConfirmedBooking: false }), false);
});

test("unreadable terms or booking state mask (privacy fails closed)", () => {
  assert.equal(shouldMaskContacts({ terms: "unreadable", hasConfirmedBooking: false }), true);
  assert.equal(shouldMaskContacts({ terms: [terms({})], hasConfirmedBooking: "unreadable" }), true);
});

test("the feature is dark unless the flag is exactly 'true'", () => {
  assert.equal(contactMaskingEnabled({}), false);
  assert.equal(contactMaskingEnabled({ [CONTACT_MASKING_FLAG]: "1" }), false);
  assert.equal(contactMaskingEnabled({ [CONTACT_MASKING_FLAG]: "true" }), true);
});

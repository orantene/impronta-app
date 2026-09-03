/**
 * customer-identity — the rule for "the same person", with no I/O.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEmail,
  normalizePhoneE164,
  normalizeDisplayName,
  resolveCustomerIdentity,
} from "@/lib/customers/customer-identity";

test("email is lowercased and trimmed", () => {
  assert.equal(normalizeEmail("  Ana@Example.COM "), "ana@example.com");
  assert.equal(normalizeEmail("   "), null);
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail(undefined), null);
});

test("phone: E.164 only, formatting stripped, no country guessing", () => {
  assert.equal(normalizePhoneE164("+52 998 400 1234"), "+529984001234");
  assert.equal(normalizePhoneE164("+52 (998) 400-1234"), "+529984001234");
  // No country code → dropped, NOT guessed. Guessing silently creates a second
  // customer for the same human.
  assert.equal(normalizePhoneE164("998 400 1234"), null);
  assert.equal(normalizePhoneE164("9984001234"), null);
  assert.equal(normalizePhoneE164("+0123456789"), null); // E.164 forbids a leading 0
  assert.equal(normalizePhoneE164("+1234"), null); // too short
  assert.equal(normalizePhoneE164(""), null);
});

test("normalizePhoneE164 agrees with the customers_phone_e164_shape CHECK", () => {
  // The DB constraint is: phone_e164 ~ '^\+[1-9][0-9]{6,14}$'
  const dbCheck = /^\+[1-9][0-9]{6,14}$/;
  for (const candidate of ["+529984001234", "+14155550123", "+442071838750", "+5215512345678"]) {
    const out = normalizePhoneE164(candidate);
    assert.equal(out, candidate);
    assert.equal(dbCheck.test(out!), true, `${candidate} must satisfy the DB CHECK`);
  }
  // Anything this function returns must satisfy the CHECK, or the insert throws.
  for (const junk of ["+0999", "abc", "+", "++5299", "5299"]) {
    const out = normalizePhoneE164(junk);
    if (out !== null) assert.equal(dbCheck.test(out), true);
  }
});

test("display name is collapsed, trimmed and capped, never empty string", () => {
  assert.equal(normalizeDisplayName("  Ana   María  "), "Ana María");
  assert.equal(normalizeDisplayName("   "), null);
  assert.equal(normalizeDisplayName("x".repeat(300))?.length, 200);
});

test("email alone is a valid identity — this is the whole point of the table", () => {
  const r = resolveCustomerIdentity({ email: "Guest@Example.com" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.identity, {
    email: "guest@example.com",
    phoneE164: null,
    displayName: null,
  });
});

test("phone alone is a valid identity", () => {
  const r = resolveCustomerIdentity({ phone: "+52 998 400 1234" });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.identity.phoneE164, "+529984001234");
  assert.equal(r.ok && r.identity.email, null);
});

test("neither key → refused, not invented", () => {
  const r = resolveCustomerIdentity({ displayName: "Ana" });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, "no_key");
});

test("a malformed email is refused rather than stored as a permanent key", () => {
  for (const bad of ["ana", "ana@", "@example.com", "ana@example", "a@b..c", "ana@@example.com"]) {
    const r = resolveCustomerIdentity({ email: bad });
    assert.equal(r.ok, false, `${bad} must be refused`);
    assert.equal(!r.ok && r.reason, "bad_email");
  }
});

test("a phone missing its country code, with no email, gets the SPECIFIC message", () => {
  const r = resolveCustomerIdentity({ phone: "998 400 1234" });
  assert.equal(r.ok, false);
  // Not "no_key" — they gave us something; telling them they gave us nothing
  // is how a guest gives up at checkout.
  assert.equal(!r.ok && r.reason, "bad_phone");
});

test("an unusable phone alongside a good email is dropped, not fatal", () => {
  const r = resolveCustomerIdentity({ email: "ana@example.com", phone: "998 400 1234" });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.identity.email, "ana@example.com");
  assert.equal(r.ok && r.identity.phoneE164, null);
});

test("case and whitespace differences resolve to ONE identity", () => {
  const a = resolveCustomerIdentity({ email: "Ana@Example.com" });
  const b = resolveCustomerIdentity({ email: "  ana@example.COM  " });
  assert.equal(a.ok && b.ok && a.identity.email === b.identity.email, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// Regression: a phone number does not identify a person.
//
// Migration 20261228000140 made (tenant_id, phone_e164) UNIQUE. Applying it to
// production created 3 customers where the dry run predicted 8: six client
// profiles share +52 998 400 1234, and `ON CONFLICT DO NOTHING` dropped five
// people without an error. 20261228000141 narrowed the index to
// `WHERE email IS NULL` and `ensureCustomer` now looks up by phone only when
// there is no email.
//
// These assert the shape of the rule at the level this module owns: two people
// with different emails and the SAME phone are two identities.
// ─────────────────────────────────────────────────────────────────────────────

test("two people sharing one phone are two identities when they have emails", () => {
  const a = resolveCustomerIdentity({ email: "ana@example.com", phone: "+529984001234" });
  const b = resolveCustomerIdentity({ email: "luis@example.com", phone: "+529984001234" });

  assert.equal(a.ok && b.ok, true);
  assert.notEqual(a.ok && a.identity.email, b.ok && b.identity.email);
  // Same phone is expected and must not be treated as sameness.
  assert.equal(a.ok && b.ok && a.identity.phoneE164 === b.identity.phoneE164, true);
});

test("a phone-only buyer still resolves to a phone identity", () => {
  const r = resolveCustomerIdentity({ phone: "+529984001234" });
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.identity.email, null);
  assert.equal(r.ok && r.identity.phoneE164, "+529984001234");
});

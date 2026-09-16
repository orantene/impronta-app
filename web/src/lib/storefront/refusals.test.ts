import assert from "node:assert/strict";
import { test } from "node:test";

import { createTranslator } from "@/i18n/messages";

import { engineCode, KNOWN_ENGINE_CODES, mapEngineRefusal, refusalReasonFor } from "./refusals";

const REASONS = ["full", "past", "conflict", "identity_required", "refused"] as const;

test("every known engine code maps to one of the five reasons with a real sentence in en and es", () => {
  for (const code of KNOWN_ENGINE_CODES) {
    for (const locale of ["en", "es"] as const) {
      const r = mapEngineRefusal(code, locale);
      assert.equal(r.ok, false);
      assert.equal(r.code, code);
      assert.ok(REASONS.includes(r.reason), `${code} → ${r.reason}`);
      assert.ok(r.message.length > 8, `${code}/${locale} has no sentence`);
      // The translator returns the KEY on a miss; a dotted key on screen is the bug this guards.
      assert.ok(!r.message.startsWith("public.storefront"), `${code}/${locale} rendered its key`);
    }
  }
});

test("each of the five reasons is reachable", () => {
  const seen = new Set(KNOWN_ENGINE_CODES.map((c) => refusalReasonFor(c)));
  assert.deepEqual([...seen].sort(), [...REASONS].sort());
});

test("engine shapes: string, {reason}, {refusalKey}, {code}, and a Postgres 23514 on the identity CHECK", () => {
  assert.equal(engineCode("sold_out"), "sold_out");
  assert.equal(engineCode({ reason: "conflict" }), "conflict");
  assert.equal(engineCode({ refusalKey: "seatsAvailable" }), "seatsAvailable");
  assert.equal(engineCode({ code: "rate_limited" }), "rate_limited");
  assert.equal(
    engineCode({ code: "23514", message: 'new row violates check constraint "orders_identified_before_payment"' }),
    "23514",
  );
  assert.equal(mapEngineRefusal({ code: "23514", message: "orders_draft_has_an_identity" }, "en").reason, "identity_required");
  // A CHECK that is not about identity is our fault, not the person's.
  assert.equal(mapEngineRefusal({ code: "23514", message: "orders_total_is_derived" }, "en").reason, "refused");
});

test("buckets: capacity → full, time → past, versions → conflict, contact → identity_required", () => {
  assert.equal(refusalReasonFor("sold_out"), "full");
  assert.equal(refusalReasonFor("ancestor_full"), "full");
  assert.equal(refusalReasonFor("slot_taken"), "full");
  assert.equal(refusalReasonFor("seat_taken"), "full");
  assert.equal(refusalReasonFor("no_band_fits_this_party"), "full");
  assert.equal(refusalReasonFor("session_already_ended"), "past");
  assert.equal(refusalReasonFor("time_not_offered"), "past");
  assert.equal(refusalReasonFor("hold_expired"), "past");
  assert.equal(refusalReasonFor("offer_expired"), "past");
  assert.equal(refusalReasonFor("conflict"), "conflict");
  assert.equal(refusalReasonFor("changedSinceOpened"), "conflict");
  assert.equal(refusalReasonFor("fingerprint_mismatch"), "conflict");
  assert.equal(refusalReasonFor("no_contact"), "identity_required");
  assert.equal(refusalReasonFor("account_required"), "identity_required");
  assert.equal(refusalReasonFor("promo_needs_customer"), "identity_required");
  assert.equal(refusalReasonFor("not_allowed"), "refused");
  assert.equal(refusalReasonFor("over_limit"), "refused");
  assert.equal(refusalReasonFor("promo_expired"), "refused");
});

test("an unknown code is refused with the generic line, never full or past", () => {
  const r = mapEngineRefusal("something_new_upstream", "en");
  assert.equal(r.reason, "refused");
  assert.equal(r.code, "something_new_upstream");
  assert.equal(r.message, createTranslator("en")("public.storefront.refusal.unavailable"));
  assert.equal(mapEngineRefusal(null, "es").reason, "refused");
  assert.equal(mapEngineRefusal({}, "es").code, "unknown");
});

test("es text differs from en text", () => {
  const en = mapEngineRefusal("sold_out", "en").message;
  const es = mapEngineRefusal("sold_out", "es").message;
  assert.notEqual(en, es);
  // An unknown locale falls back to English rather than to the key.
  assert.equal(mapEngineRefusal("sold_out", "fr").message.length > 8, true);
});

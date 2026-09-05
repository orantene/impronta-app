import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

/**
 * `inquiryId` is nullable and a null OMITS the metadata key.
 *
 * Static, because reaching the metadata object means calling Stripe. What is
 * pinned here is the SHAPE that made `""` reachable in the first place.
 */
const SRC = blankComments(
  readFileSync(join(process.cwd(), "src/lib/payments/stripe-checkout.ts"), "utf8"),
);

test("inquiryId can express absence", () => {
  // Typed `string`, a caller with no inquiry must invent one, and the only
  // value that typechecks is "". That is how an empty string becomes an id.
  assert.match(SRC, /inquiryId:\s*string\s*\|\s*null/);
});

test("a null inquiryId omits the key rather than sending an empty string", () => {
  // `metadata?.inquiry_id ?? null` yields "" for an empty string: `??` catches
  // null and undefined, not "". An absent KEY reads as absent everywhere.
  assert.match(SRC, /\.\.\.\(input\.inquiryId \? \{ inquiry_id: input\.inquiryId \} : \{\}\)/);
  assert.doesNotMatch(
    SRC,
    /inquiry_id:\s*input\.inquiryId\s*,/,
    "must not set the key unconditionally",
  );
});

test("transaction_id is still always present — it is the linkage", () => {
  // `refunds.ts` treats a PaymentIntent with no transaction_id as "not ours"
  // and returns null. That one must never be conditional.
  assert.match(SRC, /transaction_id:\s*input\.transactionId/);
});

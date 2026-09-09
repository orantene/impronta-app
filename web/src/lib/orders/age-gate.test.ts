import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ruleOnAgeGate, strictestAgeGate, type AgeGate } from "./age-gate";
import { blankComments } from "@/lib/quality/supabase-unchecked-read";

const event = (n: number): AgeGate => ({ minimumAge: n, source: "event", label: "Late Show" });
const tier = (n: number): AgeGate => ({ minimumAge: n, source: "ticket_tier", label: "Bar package" });

test("nothing gated needs no answer and asks for none", () => {
  // Demanding an age declaration to buy a coffee would be blanket collection of
  // exactly the data this design avoids collecting.
  const v = ruleOnAgeGate({ gates: [], attestation: null });
  assert.equal(v.ok, true);
  if (!v.ok) return;
  assert.equal(v.requiredMinimumAge, null);
});

test("a gated basket with no stated age is REFUSED, not sold", () => {
  // The defect, exactly. `events.age_gate` has existed for the whole phase and
  // nothing read it, so an 18+ show sold to anyone who could type an email.
  const v = ruleOnAgeGate({ gates: [event(18)], attestation: null });
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.equal(v.reason, "age_gate_unconfirmed");
  assert.equal(v.requiredMinimumAge, 18);
});

test("under the minimum is a different refusal from never asked", () => {
  // One means "ask the question", the other means "the answer was no". Folded
  // into one reason, a picker either nags a person who already answered or
  // silently retries for someone it must not sell to.
  const v = ruleOnAgeGate({ gates: [event(18)], attestation: { confirmedAge: 16 } });
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.equal(v.reason, "age_gate_below_minimum");
});

test("exactly the minimum passes", () => {
  const v = ruleOnAgeGate({ gates: [event(18)], attestation: { confirmedAge: 18 } });
  assert.equal(v.ok, true);
});

test("the strictest gate in the basket wins, whichever row it sits on", () => {
  // A cart is charged once and cannot be half-legal, the same reason
  // `resolvePurchasePolicy` takes the strictest cancellation window and refuses
  // a part pay-in-person order.
  assert.equal(strictestAgeGate([event(18), tier(21)])?.minimumAge, 21);
  assert.equal(strictestAgeGate([tier(16), event(18)])?.minimumAge, 18);
  const v = ruleOnAgeGate({ gates: [event(18), tier(21)], attestation: { confirmedAge: 19 } });
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.equal(v.requiredMinimumAge, 21);
});

test("a nonsense minimum is ignored rather than trusted", () => {
  // The column is CHECKed at 1..99, but a gate arriving as 0 or NaN from any
  // path must not become an unfalsifiable refusal on every purchase.
  assert.equal(strictestAgeGate([{ minimumAge: 0, source: "event", label: null }]), null);
  assert.equal(strictestAgeGate([{ minimumAge: Number.NaN, source: "event", label: null }]), null);
});

test("the passing verdict carries what to snapshot on the order", () => {
  const v = ruleOnAgeGate({ gates: [event(18)], attestation: { confirmedAge: 30 } });
  assert.equal(v.ok, true);
  if (!v.ok) return;
  assert.equal(v.requiredMinimumAge, 18);
  assert.equal(v.confirmedAge, 30);
});

const LOADER = blankComments(readFileSync(join(process.cwd(), "src/lib/orders/age-gate.ts"), "utf8"));
const PURCHASE = blankComments(readFileSync(join(process.cwd(), "src/lib/orders/purchase.ts"), "utf8"));

test("an unreadable gate refuses the purchase instead of reading as ungated", () => {
  // The house rule is that parsers fail CLOSED and return empty. A gate is the
  // one place where "empty" and "permitted" are the same value, so it must
  // fail the other way: a slow database must not sell an 18+ ticket to a child.
  assert.match(LOADER, /return \{ ok: false \};/, "a failed read is a distinct outcome");
  assert.match(PURCHASE, /if \(!gates\.ok\)/, "and the pipeline stops on it");
  assert.match(PURCHASE, /Could not check the age restriction/, "reported as a retry, not a verdict");
});

test("the gate is read from the database, never taken from the caller", () => {
  // Same class of mistake `resolvePurchasePolicy` exists to make impossible: an
  // age gate the client sends is an age gate the client can delete.
  assert.match(PURCHASE, /await loadAgeGates\(admin/, "loaded in this request");
  assert.doesNotMatch(PURCHASE, /input\.ageGate|input\.minimumAge/, "never sent");
});

test("the age check runs before the basket is priced", () => {
  // A refusal must cost the buyer nothing and must not depend on whether the
  // basket happens to price cleanly.
  const age = PURCHASE.indexOf("await loadAgeGates(admin");
  const price = PURCHASE.indexOf("pricePurchase(input.lines");
  assert.ok(age > -1 && price > -1);
  assert.ok(age < price, "age first");
});

test("what was told and what was answered are both snapshotted on the order", () => {
  assert.match(PURCHASE, /age_gate_min_age: ageVerdict\.requiredMinimumAge/, "");
  assert.match(PURCHASE, /age_gate_confirmed_age: ageVerdict\.confirmedAge/, "");
});

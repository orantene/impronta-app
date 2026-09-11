import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ageGateStamp, ruleOnAgeGate, strictestAgeGate, type AgeGate } from "./age-gate";
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
  const stamp = ageGateStamp(
    { ok: true, requiredMinimumAge: 18, confirmedAge: 30 },
    "2026-09-09T04:00:00.000Z",
  );
  assert.equal(stamp.age_gate_min_age, 18);
  assert.equal(stamp.age_gate_confirmed_age, 30);
  assert.equal(stamp.age_gate_confirmed_at, "2026-09-09T04:00:00.000Z");
});

test("the order takes all three age columns from one call, not three expressions", () => {
  // Three separate expressions is how they came apart: two read the verdict
  // directly and the third was conditional on the minimum, so an ungated
  // basket with an attestation wrote a triple `orders_age_gate_paired`
  // refuses. Writing them individually here must stay impossible.
  assert.match(PURCHASE, /\.\.\.ageGateStamp\(ageVerdict, new Date\(\)\.toISOString\(\)\)/, "one call");
  assert.doesNotMatch(PURCHASE, /age_gate_confirmed_at:/, "not assembled at the insert");
});

test("an ungated basket never writes a half-filled triple", () => {
  // THE DEFECT. A client that collected an age and then lost its gated line —
  // or raced an operator lowering the gate — sent an attestation for a basket
  // with no gate. The verdict passed, and the insert then set confirmed_age
  // with a NULL minimum and a NULL timestamp: a CHECK violation, surfacing to
  // a buyer who had just confirmed their age as "Could not start the order",
  // on the one path where money and capacity are about to move.
  const v = ruleOnAgeGate({ gates: [], attestation: { confirmedAge: 21 } });
  assert.equal(v.ok, true);
  if (!v.ok) return;
  assert.equal(v.requiredMinimumAge, null);
  assert.equal(v.confirmedAge, null, "a volunteered age against no gate is discarded, not stored");

  const stamp = ageGateStamp(v, "2026-09-09T04:00:00.000Z");
  assert.deepEqual(stamp, {
    age_gate_min_age: null,
    age_gate_confirmed_age: null,
    age_gate_confirmed_at: null,
  });
});

test("the stamp is all three or none, for every verdict shape", () => {
  // `orders_age_gate_paired` accepts exactly two shapes. Anything the stamp can
  // return must be one of them, including combinations no current caller
  // produces — the next caller is the one that gets this wrong.
  const shapes: Array<{ requiredMinimumAge: number | null; confirmedAge: number | null }> = [
    { requiredMinimumAge: null, confirmedAge: null },
    { requiredMinimumAge: null, confirmedAge: 21 },
    { requiredMinimumAge: 18, confirmedAge: null },
    { requiredMinimumAge: 18, confirmedAge: 21 },
  ];
  for (const shape of shapes) {
    const stamp = ageGateStamp({ ok: true, ...shape }, "2026-09-09T04:00:00.000Z");
    const set = [stamp.age_gate_min_age, stamp.age_gate_confirmed_age, stamp.age_gate_confirmed_at]
      .filter((v) => v !== null).length;
    assert.ok(
      set === 0 || set === 3,
      `${JSON.stringify(shape)} produced ${set} of 3 set columns, which the CHECK refuses`,
    );
  }
});

import test from "node:test";
import assert from "node:assert/strict";

import {
  SHEET_STEPS,
  allowedPaymentChoices,
  applicableSteps,
  canAdvance,
  canAskFirst,
  canSubmit,
  furthestReachableStep,
  nextStep,
  stepNumber,
  type SheetPolicy,
  type SheetState,
  visibleStep,
} from "./sheet-steps";

const TIMED: SheetPolicy = {
  needsWhen: true,
  requireAccount: false,
  allowPayInPerson: false,
  depositPct: null,
  captchaRequired: true,
};

const UNTIMED: SheetPolicy = { ...TIMED, needsWhen: false };

function state(over: Partial<SheetState> = {}): SheetState {
  return {
    lineCount: 1,
    whenChosen: true,
    partySize: null,
    email: "ana@rivera.mx",
    signedIn: false,
    captchaToken: "tok",
    honeypot: "",
    paymentChoice: "full",
    ...over,
  };
}

// ─── The conditional "when" step ─────────────────────────────────────────

test("an untimed cart has no when step, and numbers the rest without a gap", () => {
  // Two tacos have no time. Numbering over all five steps would count "1, 3".
  assert.deepEqual(applicableSteps(UNTIMED), ["lines", "who", "pay", "done"]);
  assert.equal(stepNumber("lines", UNTIMED), 1);
  assert.equal(stepNumber("who", UNTIMED), 2);
  assert.equal(stepNumber("pay", UNTIMED), 3);
  assert.equal(stepNumber("when", UNTIMED), null);
});

test("a timed cart keeps when in sequence", () => {
  assert.deepEqual(applicableSteps(TIMED), [...SHEET_STEPS]);
  assert.equal(stepNumber("when", TIMED), 2);
  assert.equal(stepNumber("who", TIMED), 3);
});

test("nextStep skips the step that does not apply", () => {
  assert.equal(nextStep("lines", UNTIMED), "who");
  assert.equal(nextStep("lines", TIMED), "when");
  assert.equal(nextStep("pay", TIMED), "done");
  assert.equal(nextStep("done", TIMED), null);
});

test("an untimed cart never blocks on a time it does not have", () => {
  assert.equal(canAdvance("when", state({ whenChosen: false }), UNTIMED), true);
  assert.equal(canAdvance("when", state({ whenChosen: false }), TIMED), false);
});

// ─── Lines ───────────────────────────────────────────────────────────────

test("an empty cart cannot advance and cannot submit", () => {
  const empty = state({ lineCount: 0 });
  assert.equal(canAdvance("lines", empty, TIMED), false);
  assert.equal(canSubmit(empty, TIMED), false);
});

// ─── Party size belongs to when ──────────────────────────────────────────

test("a table for an unknown number of people is not a reservation", () => {
  assert.equal(canAdvance("when", state({ partySize: 0 }), TIMED), false);
  assert.equal(canAdvance("when", state({ partySize: 4 }), TIMED), true);
  // Null means the tenant does not ask, which must not block.
  assert.equal(canAdvance("when", state({ partySize: null }), TIMED), true);
});

// ─── Who, and the guards that must not change ────────────────────────────

test("a guest needs a usable email", () => {
  assert.equal(canAdvance("who", state({ email: "" }), TIMED), false);
  assert.equal(canAdvance("who", state({ email: "nope" }), TIMED), false);
  assert.equal(canAdvance("who", state({ email: "@rivera.mx" }), TIMED), false);
  assert.equal(canAdvance("who", state({ email: "  ana@rivera.mx  " }), TIMED), true);
});

test("a filled honeypot blocks, always", () => {
  assert.equal(canAdvance("who", state({ honeypot: "bot" }), TIMED), false);
  // Even signed in? No: a signed-in customer never renders the honeypot, so it
  // cannot be filled, and short-circuiting on signedIn first is correct.
  assert.equal(canAdvance("who", state({ honeypot: "bot", signedIn: true }), TIMED), true);
});

test("a guest needs the captcha when the tenant requires it", () => {
  assert.equal(canAdvance("who", state({ captchaToken: "" }), TIMED), false);
  assert.equal(
    canAdvance("who", state({ captchaToken: "" }), { ...TIMED, captchaRequired: false }),
    true,
  );
  // A signed-in customer is not challenged, exactly as today.
  assert.equal(canAdvance("who", state({ captchaToken: "", signedIn: true }), TIMED), true);
});

test("require_account_to_book stops a guest and admits a signed-in customer", () => {
  const gated: SheetPolicy = { ...TIMED, requireAccount: true };
  assert.equal(canAdvance("who", state(), gated), false);
  assert.equal(canAdvance("who", state({ signedIn: true }), gated), true);
  assert.equal(canSubmit(state(), gated), false);
});

// ─── Pay, read from policy and never asserted ────────────────────────────

test("the payment choices offered are exactly what the policy permits", () => {
  assert.deepEqual(allowedPaymentChoices(TIMED), ["full"]);
  assert.deepEqual(allowedPaymentChoices({ ...TIMED, allowPayInPerson: true }), [
    "full",
    "in_person",
  ]);
  assert.deepEqual(allowedPaymentChoices({ ...TIMED, depositPct: 30 }), ["deposit", "full"]);
  // A zero or negative deposit percentage is not a deposit option.
  assert.deepEqual(allowedPaymentChoices({ ...TIMED, depositPct: 0 }), ["full"]);
});

test("a choice the policy forbids cannot advance", () => {
  // This is the display half of the contract. The pipeline re-validates the
  // same fields at submit, because a guest can edit anything that reaches an
  // endpoint — "pay in person" on an offering that forbids it would otherwise
  // be a free lunch.
  assert.equal(canAdvance("pay", state({ paymentChoice: "in_person" }), TIMED), false);
  assert.equal(
    canAdvance("pay", state({ paymentChoice: "in_person" }), { ...TIMED, allowPayInPerson: true }),
    true,
  );
  assert.equal(canAdvance("pay", state({ paymentChoice: "deposit" }), TIMED), false);
  assert.equal(canAdvance("pay", state({ paymentChoice: null }), TIMED), false);
});

// ─── The cursor is derived, never stored ─────────────────────────────────

test("emptying the cart at the pay step returns the guest to lines", () => {
  // A stored cursor is how a checkout ends up submittable with nothing in it.
  const emptied = state({ lineCount: 0 });
  assert.equal(furthestReachableStep(emptied, TIMED), "lines");
});

test("the furthest step is exactly what the state has earned", () => {
  assert.equal(furthestReachableStep(state({ whenChosen: false }), TIMED), "when");
  assert.equal(furthestReachableStep(state({ email: "" }), TIMED), "who");
  assert.equal(furthestReachableStep(state({ paymentChoice: null }), TIMED), "pay");
  assert.equal(furthestReachableStep(state(), TIMED), "done");
});

test("a complete cart submits; an incomplete one never does", () => {
  assert.equal(canSubmit(state(), TIMED), true);
  assert.equal(canSubmit(state(), UNTIMED), true);
  for (const broken of [
    { lineCount: 0 },
    { whenChosen: false },
    { email: "" },
    { honeypot: "bot" },
    { captchaToken: "" },
    { paymentChoice: null as null },
  ]) {
    assert.equal(canSubmit(state(broken), TIMED), false, `${JSON.stringify(broken)} submitted`);
  }
});

// ─── Ask first ───────────────────────────────────────────────────────────

test("Ask first works from the first step, with no email", () => {
  // The storefront-to-chat handoff: two dishes and no identity. Gating it
  // behind the who step would remove the reason it exists.
  assert.equal(canAskFirst(state({ email: "", captchaToken: "", whenChosen: false })), true);
  assert.equal(canAskFirst(state({ lineCount: 0 })), false);
});

test("Ask first is available even when the policy forbids guest booking", () => {
  // require_account_to_book stops a PURCHASE. It must not stop a question.
  assert.equal(canAskFirst(state()), true);
  assert.equal(canSubmit(state(), { ...TIMED, requireAccount: true }), false);
});

test("the cursor is derived: a step whose precondition lapses cannot be stood on", () => {
  // The Sheet's only rule of its own. A stored cursor is how a checkout ends up
  // submittable with nothing in it, so `viewing` is a request and this decides.
  const policy: SheetPolicy = {
    needsWhen: false,
    requireAccount: false,
    allowPayInPerson: false,
    depositPct: null,
    captchaRequired: false,
  };
  const ready: SheetState = {
    lineCount: 2,
    whenChosen: false,
    partySize: null,
    email: "guest@example.com",
    signedIn: false,
    captchaToken: "",
    honeypot: "",
    paymentChoice: null,
  };
  // Standing on pay, legitimately.
  assert.equal(visibleStep("pay", ready, policy), "pay");

  // Now the cart empties underneath them. They must not still be on pay.
  const emptied: SheetState = { ...ready, lineCount: 0 };
  assert.equal(visibleStep("pay", emptied, policy), "lines");

  // Asking to jump ahead is refused too: a request is not an entitlement.
  assert.equal(visibleStep("pay", { ...ready, email: "" }, policy), "who");
});

test("a request for a step this cart does not have shows the start, not a crash", () => {
  const untimed: SheetPolicy = {
    needsWhen: false,
    requireAccount: false,
    allowPayInPerson: false,
    depositPct: null,
    captchaRequired: false,
  };
  const state: SheetState = {
    lineCount: 1,
    whenChosen: false,
    partySize: null,
    email: "",
    signedIn: false,
    captchaToken: "",
    honeypot: "",
    paymentChoice: null,
  };
  // "when" does not exist on an untimed cart.
  assert.equal(visibleStep("when", state, untimed), "lines");
});

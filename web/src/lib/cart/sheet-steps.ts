/**
 * sheet-steps.ts — the Sheet's step machine, as a pure function. F3b.
 *
 * One purchase sheet for every tenant type: lines, then when, then who, then
 * pay, then done. It replaces `OfferingInstantMount`, the slot composer's
 * instant path and the menu board's form, which each reimplement this sequence
 * with slightly different rules.
 *
 * WHY THE MACHINE IS PURE AND SEPARATE FROM THE COMPONENT
 * ──────────────────────────────────────────────────────
 * Every interesting bug in a checkout is a state bug: a step that can be
 * skipped, a button enabled a moment too early, a "when" that disappears for
 * an untimed offering and takes the step numbering with it. None of that is
 * visible in a screenshot and all of it is assertable here.
 *
 * THREE RULES THIS ENCODES, AND WHY EACH ONE EXISTS
 * ────────────────────────────────────────────────
 * 1. WHEN IS CONDITIONAL. A table and a class have a time; two tacos do not.
 *    An untimed cart must not render an empty step, and the steps a guest sees
 *    must be numbered over the steps that ACTUALLY apply, or a two-step flow
 *    counts "1, 3".
 *
 * 2. POLICY IS READ, NEVER ASSERTED. `requireAccount`, `allowPayInPerson` and
 *    `depositPct` arrive from the offering. The Sheet reads them to decide what
 *    to SHOW; the purchase pipeline re-validates every one at submit, because a
 *    guest can edit anything that reaches an endpoint. A display read that
 *    doubles as a gate is how "pay in person" becomes a free lunch on an
 *    offering that does not allow it.
 *
 * 3. THE GUARDS ARE UNCHANGED. Captcha and honeypot are required for a guest
 *    exactly as `OfferingInstantMount` requires them today. This module changes
 *    what a guest GETS, never what a guest MAY do.
 */

export const SHEET_STEPS = ["lines", "when", "who", "pay", "done"] as const;
export type SheetStep = (typeof SHEET_STEPS)[number];

/** What the offering's own policy permits. Read from the offering, never guessed. */
export type SheetPolicy = {
  /** True when the cart needs a time: a slot, a session, or a service window. */
  readonly needsWhen: boolean;
  /** `require_account_to_book`. A guest cannot complete; they must sign in. */
  readonly requireAccount: boolean;
  /** `allow_pay_in_person`. */
  readonly allowPayInPerson: boolean;
  /** `deposit_pct`, null when the whole amount is due. */
  readonly depositPct: number | null;
  /** A guest must clear the abuse guards; a signed-in customer need not. */
  readonly captchaRequired: boolean;
};

export type SheetState = {
  readonly lineCount: number;
  /** Chosen slot / session / window, when `needsWhen`. */
  readonly whenChosen: boolean;
  /** Party size, when the tenant asks for one. Null means not applicable. */
  readonly partySize: number | null;
  readonly email: string;
  readonly signedIn: boolean;
  readonly captchaToken: string;
  /** Must stay empty. A filled honeypot is a bot. */
  readonly honeypot: string;
  readonly paymentChoice: "full" | "deposit" | "in_person" | null;
};

/** The steps that actually apply to this cart, in order. */
export function applicableSteps(policy: SheetPolicy): SheetStep[] {
  return SHEET_STEPS.filter((step) => step !== "when" || policy.needsWhen);
}

/**
 * The guest-facing number of a step, counted over the steps that apply.
 *
 * Returns null for a step this cart does not have. Without this, an untimed
 * cart numbers its steps "1, 3, 4" because `when` still occupies a slot.
 */
export function stepNumber(step: SheetStep, policy: SheetPolicy): number | null {
  const index = applicableSteps(policy).indexOf(step);
  return index === -1 ? null : index + 1;
}

function emailLooksUsable(email: string): boolean {
  const value = email.trim();
  // Deliberately loose. The real validation is `isValidAuthEmail` on the
  // server; this only decides whether to enable a button, and being stricter
  // here than the server is how a valid address gets rejected by a disabled
  // control with no explanation.
  return value.length >= 3 && value.includes("@") && !value.startsWith("@");
}

/** Which payment choices this policy actually permits, in display order. */
export function allowedPaymentChoices(
  policy: SheetPolicy,
): Array<"full" | "deposit" | "in_person"> {
  const out: Array<"full" | "deposit" | "in_person"> = [];
  if (policy.depositPct !== null && policy.depositPct > 0) out.push("deposit");
  out.push("full");
  if (policy.allowPayInPerson) out.push("in_person");
  return out;
}

/**
 * Can the guest leave `step`?
 *
 * Every answer is a requirement a human can see and fix. Nothing here is a
 * security decision: the pipeline re-validates identity, policy and price at
 * submit regardless of what this returns.
 */
export function canAdvance(
  step: SheetStep,
  state: SheetState,
  policy: SheetPolicy,
): boolean {
  switch (step) {
    case "lines":
      return state.lineCount > 0;
    case "when":
      // Party size, when the tenant asks for one, is part of "when": a table
      // for an unknown number of people is not a reservation.
      if (!policy.needsWhen) return true;
      if (!state.whenChosen) return false;
      return state.partySize === null || state.partySize > 0;
    case "who":
      if (state.signedIn) return true;
      if (policy.requireAccount) return false;
      if (!emailLooksUsable(state.email)) return false;
      // The guards, exactly as they are today.
      if (state.honeypot.trim().length > 0) return false;
      if (policy.captchaRequired && state.captchaToken.trim().length === 0) return false;
      return true;
    case "pay":
      return (
        state.paymentChoice !== null &&
        allowedPaymentChoices(policy).includes(state.paymentChoice)
      );
    case "done":
      return false;
  }
}

/** The step after `step`, skipping what does not apply. Null at the end. */
export function nextStep(step: SheetStep, policy: SheetPolicy): SheetStep | null {
  const steps = applicableSteps(policy);
  const index = steps.indexOf(step);
  if (index === -1 || index === steps.length - 1) return null;
  return steps[index + 1] ?? null;
}

/**
 * The furthest step this state has actually earned.
 *
 * The Sheet renders from THIS rather than from a stored cursor, so a guest who
 * empties their cart at the pay step is returned to `lines` instead of being
 * left on a step whose precondition no longer holds. A stored cursor is how a
 * checkout ends up submittable with nothing in it.
 */
export function furthestReachableStep(state: SheetState, policy: SheetPolicy): SheetStep {
  const steps = applicableSteps(policy);
  let reached: SheetStep = steps[0] ?? "lines";
  for (const step of steps) {
    if (step === "done") break;
    if (!canAdvance(step, state, policy)) return reached;
    reached = nextStep(step, policy) ?? step;
  }
  return reached;
}

/**
 * Is this cart submittable?
 *
 * Every applicable step before `done` must pass. A guest cannot arrive at pay
 * with an unmet earlier requirement, whatever the UI let them click.
 */
export function canSubmit(state: SheetState, policy: SheetPolicy): boolean {
  return applicableSteps(policy)
    .filter((step) => step !== "done")
    .every((step) => canAdvance(step, state, policy));
}

/**
 * "Ask first" is available from the FIRST step, with lines and nothing else.
 *
 * That is the whole storefront-to-chat handoff: a guest with two dishes in a
 * cart and no email can open the chat with the draft attached. Gating it behind
 * the who step would remove the reason it exists.
 */
export function canAskFirst(state: SheetState): boolean {
  return state.lineCount > 0;
}

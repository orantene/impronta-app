/**
 * What the Orders desk SAYS when a refund does not happen.
 *
 * THE DEFECT THIS EXISTS TO END. The desk's refund form rendered whatever
 * string came back from the server action straight into its status line, and
 * those strings are reason CODES. A cashier who tried to refund a cash sale
 * read the word `refund_refused`; the sentence that actually explains it —
 * "collected off-platform (cash, wire) ... record it as an off-platform refund
 * instead", written in `computeRefundEligibility` — was thrown away one frame
 * earlier. The engine's own English `error` is no better on that line: it is
 * English, and this screen is read in three languages.
 *
 * So: engines return codes, this module maps a code to a MESSAGE KEY, and the
 * screen renders the translated sentence. `projects/[projectId]/actions.ts`
 * states the same rule for deliverables; this is the money half of it.
 *
 * PURE, AND NO CLOCK. Given a code it returns a key, always the same one. The
 * keys are written out as literals so `message-key-usage.static.test.ts` can
 * see them: a templated `dashboard.orders.refundOutcome.${code}` would be
 * invisible to that guard, and `createTranslator` renders a missed path as the
 * path itself, so a typo would ship as visible dotted text with every gate
 * green.
 *
 * AN UNKNOWN CODE IS NOT AN UNKNOWN OUTCOME. `refundDeskOutcome` folds anything
 * it does not recognise into `unavailable`, which says "nothing was refunded,
 * try again" — the only claim that is safe to make about a code this module has
 * never seen. It must never fold into a SUCCESS, and it must never fall through
 * to printing the raw code again.
 */

/** Every outcome the desk's refund form can land on, success included. */
export const REFUND_DESK_OUTCOMES = [
  "refunded",
  "pick_a_line",
  "not_allowed",
  "invalid",
  "not_found",
  "nothing_to_refund",
  "line_already_refunded",
  "exceeds_captured",
  "no_provider_charge",
  "provider_refused",
  "partial_failure",
  "unavailable",
] as const;

export type RefundDeskOutcome = (typeof REFUND_DESK_OUTCOMES)[number];

/**
 * Reason codes the money engines return, mapped onto what a person is told.
 *
 * Several engine codes collapse onto one sentence on purpose. `not_found`,
 * `wrong_tenant` and `order_not_found` are three different facts inside the
 * engine and ONE fact at the counter: the record is not here. Telling a cashier
 * which of the three it was would say something about another workspace's data.
 */
const ENGINE_CODE_TO_OUTCOME: Readonly<Record<string, RefundDeskOutcome>> = {
  // Nothing was picked, or what was picked is not refundable.
  empty: "pick_a_line",
  nothing_to_refund: "nothing_to_refund",
  line_not_on_order: "not_found",
  not_a_component: "not_found",
  line_already_refunded: "line_already_refunded",
  exceeds_captured: "exceeds_captured",
  // Who is asking.
  not_allowed: "not_allowed",
  invalid: "invalid",
  // Which record.
  not_found: "not_found",
  wrong_tenant: "not_found",
  order_not_found: "not_found",
  // What the provider said.
  no_provider_charge: "no_provider_charge",
  stripe_not_configured: "no_provider_charge",
  refund_refused: "provider_refused",
  provider_refused: "provider_refused",
  // `computeRefundEligibility`'s own codes.
  not_collected: "nothing_to_refund",
  already_refunded: "line_already_refunded",
  is_a_refund: "not_found",
  amount: "exceeds_captured",
  // Money moved and then a leg failed. Never retryable.
  partial_failure: "partial_failure",
  unavailable: "unavailable",
};

export function refundDeskOutcome(code: string | null | undefined): RefundDeskOutcome {
  if (!code) return "unavailable";
  return ENGINE_CODE_TO_OUTCOME[code] ?? "unavailable";
}

/**
 * The message key for an outcome. Full literal keys, one per member.
 */
export const REFUND_DESK_KEY: Readonly<Record<RefundDeskOutcome, string>> = {
  refunded: "dashboard.orders.refundOutcome.refunded",
  pick_a_line: "dashboard.orders.refundOutcome.pickALine",
  not_allowed: "dashboard.orders.refundOutcome.notAllowed",
  invalid: "dashboard.orders.refundOutcome.invalid",
  not_found: "dashboard.orders.refundOutcome.notFound",
  nothing_to_refund: "dashboard.orders.refundOutcome.nothingToRefund",
  line_already_refunded: "dashboard.orders.refundOutcome.lineAlreadyRefunded",
  exceeds_captured: "dashboard.orders.refundOutcome.exceedsCaptured",
  no_provider_charge: "dashboard.orders.refundOutcome.noProviderCharge",
  provider_refused: "dashboard.orders.refundOutcome.providerRefused",
  partial_failure: "dashboard.orders.refundOutcome.partialFailure",
  unavailable: "dashboard.orders.refundOutcome.unavailable",
};

/**
 * Whether this outcome means the operator may press Confirm again.
 *
 * `partial_failure` is the one that must never be retried: refunds that landed
 * are real and a second run would send them twice, which Stripe cannot undo.
 * Success is not retryable either — there is nothing left to do.
 */
export function refundIsRetryable(outcome: RefundDeskOutcome): boolean {
  return outcome !== "partial_failure" && outcome !== "refunded";
}

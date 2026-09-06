/**
 * Cancel and reactivate must REACH STRIPE.
 *
 * The original P0 (#1482) was not "cancel is missing". Cancel existed and
 * looked like it worked: it wrote `agencies.plan_tier` locally and returned
 * success. Stripe was never told, so the next `customer.subscription.updated`
 * re-synced the tier straight back and the customer kept being billed.
 *
 * A test that asserts the LOCAL ROW flipped would have passed against that
 * defect, which is exactly why this file asserts the STRIPE CALL instead. It is
 * static rather than behavioural on purpose: the failure mode is an absent API
 * call, and absence is what a source assertion can see without a Stripe mock
 * that would itself have to be trusted.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC = resolve(process.cwd(), "src");
const billing = readFileSync(join(SRC, "lib/stripe/workspace-billing.ts"), "utf8");

/** The body of a named exported function, up to the next top-level export. */
function bodyOf(source: string, fnName: string): string {
  const start = source.indexOf(`export async function ${fnName}(`);
  assert.notEqual(start, -1, `${fnName} not found — it was renamed or removed`);
  const rest = source.slice(start + 1);
  const next = rest.indexOf("\nexport ");
  return next === -1 ? rest : rest.slice(0, next);
}

test("cancel actually tells STRIPE, not just the database", () => {
  const body = bodyOf(billing, "cancelWorkspaceSubscriptionAtPeriodEnd");
  assert.match(
    body,
    /stripe\.subscriptions\.update\(/,
    "cancel must call stripe.subscriptions.update — the original defect was a local write with no Stripe call",
  );
  assert.match(body, /cancel_at_period_end:\s*true/, "cancel must set cancel_at_period_end: true");
});

test("cancel does NOT refund and does NOT end the plan immediately", () => {
  // The ruling: no money moves on cancel; the customer keeps the month they
  // paid for. A `refunds.create` or a `cancel()` here would be a policy change
  // smuggled in as an implementation detail.
  const body = bodyOf(billing, "cancelWorkspaceSubscriptionAtPeriodEnd");
  assert.doesNotMatch(body, /refunds\.create/, "cancel must not issue a refund");
  assert.doesNotMatch(
    body,
    /stripe\.subscriptions\.cancel\(/,
    "cancel must schedule at period end, never end the subscription immediately",
  );
});

test("reactivate actually tells STRIPE", () => {
  const body = bodyOf(billing, "reactivateWorkspaceSubscription");
  assert.match(body, /stripe\.subscriptions\.update\(/, "reactivate must call Stripe");
  assert.match(
    body,
    /cancel_at_period_end:\s*false/,
    "reactivate must clear cancel_at_period_end at Stripe, not only locally",
  );
});

test("reactivate does not create a new charge", () => {
  // Nothing was refunded or ended, so putting the subscription back must not
  // bill anything. A checkout session or an invoice here would double-charge a
  // customer who never lost access.
  const body = bodyOf(billing, "reactivateWorkspaceSubscription");
  assert.doesNotMatch(body, /checkout\.sessions\.create/, "reactivate must not open a new checkout");
  assert.doesNotMatch(body, /invoices\.create/, "reactivate must not raise an invoice");
});

test("reactivate refuses once the subscription is genuinely canceled", () => {
  // Returning success there would tell an owner they still have a plan when
  // Stripe has ended it. The honest answer is a new checkout.
  const body = bodyOf(billing, "reactivateWorkspaceSubscription");
  assert.match(body, /status === "canceled"/, "must check for an already-canceled subscription");
  assert.match(body, /ok: false/, "an already-canceled subscription must not report success");
});

test("both paths fail CLOSED when Stripe is unavailable", () => {
  // A billing outage must not silently mark the local row as done. The whole
  // class of defect here is local state diverging from Stripe.
  for (const fn of ["cancelWorkspaceSubscriptionAtPeriodEnd", "reactivateWorkspaceSubscription"]) {
    const body = bodyOf(billing, fn);
    assert.match(body, /isStripeConfigured\(\)/, `${fn} must check Stripe is configured`);
    assert.match(body, /Billing is not available right now/, `${fn} must refuse, not proceed, without Stripe`);
  }
});

test("the plan tier is NOT written by cancel — the webhook owns that at the boundary", () => {
  // Cancel schedules; it does not downgrade. Writing plan_tier here would take
  // away paid access the customer still owns until period end, which is the
  // opposite of the ruling.
  const body = bodyOf(billing, "cancelWorkspaceSubscriptionAtPeriodEnd");
  assert.doesNotMatch(
    body,
    /plan_tier:\s*"free"/,
    "cancel must not downgrade the tier immediately; access runs to period end",
  );
});

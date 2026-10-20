/**
 * Portal cancel (Stripe API 2026-04-22.dahlia) sets `cancel_at` and leaves
 * `cancel_at_period_end` false. The subscription mirror for BOTH lanes must
 * still read that as a pending cancellation, and the Billing panel must say
 * "Ends on" instead of "Next charge".
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  billingDateLabel,
  isCancellationPending,
  resumeSubscriptionParams,
  subscriptionCancelMirror,
} from "./pending-cancellation";
import { BILLING_ES_TEXT } from "@/components/admin/shell/internal/dashboard-i18n-billing";

const NOW = new Date("2026-10-19T12:00:00Z");
const nowSec = Math.floor(NOW.getTime() / 1000);
const FUTURE = nowSec + 14 * 86_400;
const PAST = nowSec - 86_400;

type CancelFields = { cancel_at_period_end?: boolean | null; cancel_at?: number | null };

const CASES: Array<{ name: string; sub: CancelFields; pending: boolean }> = [
  { name: "period_end flag true", sub: { cancel_at_period_end: true, cancel_at: null }, pending: true },
  { name: "flag true and cancel_at future", sub: { cancel_at_period_end: true, cancel_at: FUTURE }, pending: true },
  { name: "portal cancel: flag false, cancel_at future", sub: { cancel_at_period_end: false, cancel_at: FUTURE }, pending: true },
  { name: "flag false, cancel_at null", sub: { cancel_at_period_end: false, cancel_at: null }, pending: false },
  { name: "flag and cancel_at missing", sub: {}, pending: false },
  { name: "flag false, cancel_at in the past", sub: { cancel_at_period_end: false, cancel_at: PAST }, pending: false },
];

for (const c of CASES) {
  test(`isCancellationPending: ${c.name}`, () => {
    assert.equal(isCancellationPending(c.sub, NOW), c.pending);
  });
  test(`subscriptionCancelMirror: ${c.name}`, () => {
    assert.deepEqual(subscriptionCancelMirror(c.sub, NOW), { cancel_at_period_end: c.pending });
  });
}

test("billing date label: Ends on when pending, Next charge otherwise", () => {
  assert.equal(billingDateLabel(true), "Ends on");
  assert.equal(billingDateLabel(false), "Next charge");
});

test("Spanish copy exists for both labels", () => {
  assert.equal(BILLING_ES_TEXT[billingDateLabel(true)], "Termina el");
  assert.equal(BILLING_ES_TEXT[billingDateLabel(false)], "Próximo cobro");
});

const SRC = resolve(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

test("both sync lanes write the mirror through the shared helper", () => {
  for (const file of ["lib/stripe/talent-billing.ts", "lib/stripe/workspace-billing.ts"]) {
    const src = read(file);
    assert.match(src, /subscriptionCancelMirror\(subscription\)/, `${file} must use subscriptionCancelMirror`);
    assert.doesNotMatch(
      src,
      /cancel_at_period_end:\s+subscription\.cancel_at_period_end/,
      `${file} must not copy the raw flag`,
    );
  }
});

test("resume params: portal-style sub sends only cancel_at: ''", () => {
  const p = resumeSubscriptionParams({ cancel_at_period_end: false, cancel_at: FUTURE });
  assert.deepEqual(p, { cancel_at: "" });
});

test("resume params: app-style sub (flag true, Stripe also reports cancel_at) sends only the flag", () => {
  assert.deepEqual(resumeSubscriptionParams({ cancel_at_period_end: true, cancel_at: FUTURE }), {
    cancel_at_period_end: false,
  });
  assert.deepEqual(resumeSubscriptionParams({ cancel_at_period_end: true, cancel_at: null }), {
    cancel_at_period_end: false,
  });
});

test("resume params never contain both keys", () => {
  for (const c of CASES) {
    const keys = Object.keys(resumeSubscriptionParams(c.sub));
    assert.equal(keys.length, 1, `${c.name}: ${keys.join(",")}`);
  }
});

test("both resume paths read the subscription and use resumeSubscriptionParams", () => {
  for (const file of ["lib/stripe/talent-billing.ts", "lib/stripe/workspace-billing.ts"]) {
    const src = read(file);
    assert.match(src, /resumeSubscriptionParams\(/, `${file} must use resumeSubscriptionParams`);
    assert.match(src, /subscriptions\.retrieve\(/, `${file} must read the live subscription`);
    assert.doesNotMatch(src, /cancel_at_period_end:\s*false,\s*cancel_at:/, `${file} must never send both keys`);
  }
});

test("talent billing card uses the shared label", () => {
  const card = read("app/(workspace)/[tenantSlug]/talent/settings/TalentBillingCard.tsx");
  assert.match(card, /billingDateLabel\(/);
});

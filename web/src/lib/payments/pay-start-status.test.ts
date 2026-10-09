/**
 * TUL-507: a checkout that never started must not tell the client "status unknown, do not pay again".
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { payStartViewStatus } from "./pay-start-status";

test("a start that definitely failed shows 'could not start' with a retry, never 'status unknown'", () => {
  assert.equal(payStartViewStatus("start_failed"), "startFailed");
});

test("a start that MAY have reached Stripe (or is simply unavailable) keeps 'status unknown'; an expired link keeps 'expired'", () => {
  for (const reason of ["unavailable", "not_found", "not_open", "provider_unavailable", "currency_mismatch"] as const) {
    assert.equal(payStartViewStatus(reason), "unknown", reason);
  }
  assert.equal(payStartViewStatus("expired"), "expired");
});

const link = readFileSync("src/lib/payments/link-checkout.ts", "utf8");

test("link checkout: a definite session refusal is start_failed, only an uncertain one stays unavailable", () => {
  assert.match(link, /reason: session\.uncertain === false \? "start_failed" : "unavailable"/);
  // a fresh attempt that failed before any session existed
  assert.match(link, /if \(!shell\.ok\) return \{ ok: false, reason: "start_failed" \};/);
  assert.match(link, /payments\.openPaymentLinkCheckout\.insert", insErr\);\s*\n\s*return \{ ok: false, reason: "start_failed" \};/);
  // resuming an earlier attempt (it may already have a session) is NOT turned into start_failed
  assert.match(link, /const session = await \(deps\.retrieveCheckoutSession[\s\S]{0,80}\n\s*if \(!session\.ok\) return \{ ok: false, reason: "unavailable" \};/);
});

test("the pay page and view use it, with the retry action and copy in en and es", () => {
  const page = readFileSync("src/app/(public)/pay/[code]/pay-page.tsx", "utf8");
  assert.match(page, /status=\{payStartViewStatus\(opened\.reason\)\}/);
  const view = readFileSync("src/app/(public)/pay/[code]/CheckoutView.tsx", "utf8");
  assert.match(view, /phase === "startFailed"[\s\S]{0,500}startFailedRetry/);
  for (const loc of ["en", "es"]) {
    const thread = (JSON.parse(readFileSync(`messages/${loc}.json`, "utf8")) as { public: { thread: Record<string, string> } }).public.thread;
    for (const k of ["startFailedTitle", "startFailedBody", "startFailedRetry"]) assert.ok(thread[k], `${loc}.${k}`);
  }
  const es = (JSON.parse(readFileSync("messages/es.json", "utf8")) as { public: { thread: Record<string, string> } }).public.thread;
  assert.equal(es.startFailedTitle, "No se pudo iniciar el pago");
  assert.equal(es.startFailedRetry, "Reintentar");
});

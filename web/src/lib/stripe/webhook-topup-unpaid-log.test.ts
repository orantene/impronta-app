import assert from "node:assert/strict";
import test from "node:test";
import type Stripe from "stripe";

import { processStripeEvent } from "./webhook-handler";

/**
 * A top-up completed but not paid (delayed method) credits nothing and is
 * traceable at INFO level (session id + payment_status), never as an error.
 */

function unpaidTopupEvent(paymentStatus: string): Stripe.Event {
  return {
    id: "evt_unpaid",
    type: "checkout.session.completed",
    api_version: "2026-04-22.dahlia",
    livemode: false,
    data: {
      object: {
        id: "cs_pending_1",
        mode: "payment",
        payment_status: paymentStatus,
        payment_intent: "pi_pending_1",
        amount_total: 10000,
        currency: "usd",
        customer_email: "someone@example.com",
        metadata: {
          checkout_type: "client_balance_topup",
          user_id: "user-pii-1",
          tenant_id: "t1",
          amount_cents: "10000",
        },
      },
    },
  } as unknown as Stripe.Event;
}

interface Captured {
  info: string[];
  error: string[];
}

async function capture(run: () => Promise<void>): Promise<Captured> {
  const out: Captured = { info: [], error: [] };
  const origInfo = console.info;
  const origError = console.error;
  console.info = (...a: unknown[]) => void out.info.push(a.map(String).join(" "));
  console.error = (...a: unknown[]) => void out.error.push(a.map(String).join(" "));
  try {
    await run();
    await new Promise((r) => setImmediate(r)); // let the fire-and-forget info log flush
  } finally {
    console.info = origInfo;
    console.error = origError;
  }
  return out;
}

for (const status of ["unpaid", "no_payment_required"]) {
  test(`topup completed with payment_status=${status}: INFO log with session id + status, no error log`, async () => {
    const out = await capture(() => processStripeEvent(unpaidTopupEvent(status), {} as Stripe));
    const lines = out.info.map((l) => JSON.parse(l) as Record<string, unknown>);
    const hit = lines.find((l) => l.reason === "client_balance_topup_not_paid");
    assert.ok(hit, `expected an info line, got ${JSON.stringify(out.info)}`);
    assert.equal(hit.sessionId, "cs_pending_1");
    assert.equal(hit.paymentStatus, status);
    assert.equal(out.error.length, 0, `unexpected error log: ${out.error.join("|")}`);
    const raw = out.info.join("");
    assert.ok(!raw.includes("someone@example.com"), "no email in the log line");
    assert.ok(!raw.includes("user-pii-1"), "no user id in the log line");
  });
}

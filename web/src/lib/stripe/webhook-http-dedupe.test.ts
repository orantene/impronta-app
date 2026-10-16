/**
 * TUL-743: two Stripe Dashboard endpoints point at /api/webhooks/stripe. When
 * both subscribe to the same event type, Stripe delivers the SAME event.id
 * twice (once per endpoint, each signed with that endpoint's secret). Stripe
 * also retries on its own. Either way the money side effects must run ONCE.
 *
 * This drives the real `handleStripeWebhook` end to end: real Stripe signature
 * verification, real supabase-js client, with only global `fetch` faked as a
 * tiny PostgREST that enforces the `stripe_processed_events.event_id` PRIMARY
 * KEY (duplicate insert -> 409 / 23505, exactly what Postgres returns).
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";

const SECRET_A = "whsec_test_endpoint_a";
const SECRET_B = "whsec_test_endpoint_b";

type Call = { method: string; table: string };

const realFetch = globalThis.fetch;
const savedEnv = { ...process.env };
let calls: Call[] = [];
let claimed: Set<string>;

function tableOf(url: string): string {
  const m = /\/rest\/v1\/([^?/]+)/.exec(url);
  return m ? m[1] : "";
}

function fakePostgrest(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const table = tableOf(url);
  calls.push({ method, table });
  const json = (status: number, body: unknown) =>
    Promise.resolve(
      new Response(body === null ? null : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );
  if (table === "stripe_processed_events" && method === "POST") {
    const row = JSON.parse(String(init?.body ?? "{}")) as { event_id?: string };
    const id = String(row.event_id ?? "");
    if (claimed.has(id)) {
      return json(409, {
        code: "23505",
        message: 'duplicate key value violates unique constraint "stripe_processed_events_pkey"',
        details: null,
        hint: null,
      });
    }
    claimed.add(id);
    return json(201, null);
  }
  if (table === "stripe_processed_events" && method === "DELETE") {
    const m = /event_id=eq\.([^&]+)/.exec(url);
    if (m) claimed.delete(decodeURIComponent(m[1]));
    return json(204, null);
  }
  if (method === "GET" || method === "HEAD") return json(200, []);
  return json(201, null);
}

/** Every DB write that is NOT the idempotency claim = a business side effect. */
function sideEffectCalls(): Call[] {
  return calls.filter((c) => c.table !== "" && c.table !== "stripe_processed_events");
}

const stripeForSigning = new Stripe("sk_test_signing_only");

function deliver(event: Record<string, unknown>, secret: string): Request {
  const payload = JSON.stringify(event);
  const header = stripeForSigning.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("https://app.test/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body: payload,
  });
}

const accountUpdated = {
  id: "evt_tul743_dup",
  object: "event",
  type: "account.updated",
  livemode: false,
  api_version: "2025-01-01",
  created: 1_700_000_000,
  data: {
    object: {
      id: "acct_tul743",
      object: "account",
      charges_enabled: true,
      payouts_enabled: true,
      details_submitted: true,
      metadata: {},
      requirements: { currently_due: [], past_due: [], disabled_reason: null },
    },
  },
};

describe("POST /api/webhooks/stripe is idempotent on event.id (TUL-743)", () => {
  beforeEach(() => {
    calls = [];
    claimed = new Set();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://fake.supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon_test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service_test";
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_for_unit_test";
    process.env.STRIPE_WEBHOOK_SECRET = SECRET_A;
    process.env.STRIPE_WEBHOOK_SECRET_CONNECT = SECRET_B;
    globalThis.fetch = fakePostgrest as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    process.env = { ...savedEnv };
  });

  test("same event delivered twice (two endpoints, two secrets) runs side effects once", async () => {
    const { handleStripeWebhook } = await import("./webhook-http");

    const first = await handleStripeWebhook(deliver(accountUpdated, SECRET_A));
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { received: true });
    const afterFirst = sideEffectCalls().length;
    assert.ok(afterFirst > 0, "first delivery must actually run the handler");

    const second = await handleStripeWebhook(deliver(accountUpdated, SECRET_B));
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), { received: true, idempotent: true });
    assert.equal(
      sideEffectCalls().length,
      afterFirst,
      "second delivery of the same event.id must not touch any business table",
    );
  });

  test("a Stripe retry with the same secret is also a no-op", async () => {
    const { handleStripeWebhook } = await import("./webhook-http");
    await handleStripeWebhook(deliver(accountUpdated, SECRET_A));
    const afterFirst = sideEffectCalls().length;
    const retry = await handleStripeWebhook(deliver(accountUpdated, SECRET_A));
    assert.deepEqual(await retry.json(), { received: true, idempotent: true });
    assert.equal(sideEffectCalls().length, afterFirst);
  });

  test("each configured signing secret verifies; an unknown secret is rejected before any DB call", async () => {
    const { handleStripeWebhook } = await import("./webhook-http");
    const a = await handleStripeWebhook(deliver({ ...accountUpdated, id: "evt_a" }, SECRET_A));
    const b = await handleStripeWebhook(deliver({ ...accountUpdated, id: "evt_b" }, SECRET_B));
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);

    calls = [];
    const bad = await handleStripeWebhook(deliver({ ...accountUpdated, id: "evt_c" }, "whsec_unknown"));
    assert.equal(bad.status, 400);
    assert.equal(
      calls.filter((c) => c.table === "stripe_processed_events").length,
      0,
      "an unverified body must never claim or process",
    );
  });

  test("distinct events are both processed (dedupe is per event.id, not per type)", async () => {
    const { handleStripeWebhook } = await import("./webhook-http");
    await handleStripeWebhook(deliver({ ...accountUpdated, id: "evt_x" }, SECRET_A));
    const one = sideEffectCalls().length;
    const r = await handleStripeWebhook(deliver({ ...accountUpdated, id: "evt_y" }, SECRET_A));
    assert.deepEqual(await r.json(), { received: true });
    assert.ok(sideEffectCalls().length > one);
  });
});

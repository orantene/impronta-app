/**
 * stripe-v2 — fetch-based v2 (preview) client unit tests (no network).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stripeV2Request, STRIPE_V2_PREVIEW_VERSION } from "@/lib/payments/stripe-v2";

type Captured = { url: string; init: RequestInit };

function fakeFetch(
  status: number,
  jsonBody: unknown,
  sink: Captured[],
): typeof fetch {
  const impl = async (url: string | URL | Request, init?: RequestInit) => {
    sink.push({ url: String(url), init: init ?? {} });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => jsonBody,
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return impl as any;
}

test("GET success returns ok + data, with preview version header", async () => {
  const sink: Captured[] = [];
  const r = await stripeV2Request<{ data: unknown[] }>("GET", "/v2/money_management/financial_accounts", {
    secretKey: "sk_test_x",
    fetchImpl: fakeFetch(200, { data: [{ id: "fa_1" }] }, sink),
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.data.data, [{ id: "fa_1" }]);
  const headers = sink[0].init.headers as Record<string, string>;
  assert.equal(headers["Stripe-Version"], STRIPE_V2_PREVIEW_VERSION);
  assert.equal(headers["Authorization"], "Bearer sk_test_x");
  assert.match(sink[0].url, /api\.stripe\.com\/v2\/money_management\/financial_accounts$/);
});

test("non-2xx returns ok:false with the parsed error", async () => {
  const sink: Captured[] = [];
  const r = await stripeV2Request("GET", "/v2/x", {
    secretKey: "sk_test_x",
    fetchImpl: fakeFetch(404, { error: { code: "not_found", message: "nope" } }, sink),
  });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.status, 404);
    assert.equal(r.error.code, "not_found");
  }
});

test("missing secret key → not_configured (no fetch)", async () => {
  const prev = process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_SECRET_KEY;
  const sink: Captured[] = [];
  const r = await stripeV2Request("GET", "/v2/x", { fetchImpl: fakeFetch(200, {}, sink) });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.code, "not_configured");
  assert.equal(sink.length, 0, "no fetch when unconfigured");
  if (prev !== undefined) process.env.STRIPE_SECRET_KEY = prev;
});

test("POST sends JSON body + Content-Type + Idempotency-Key", async () => {
  const sink: Captured[] = [];
  const r = await stripeV2Request("POST", "/v2/money_management/outbound_payments", {
    secretKey: "sk_test_x",
    fetchImpl: fakeFetch(200, { id: "obp_1" }, sink),
    body: { amount: { value: 100, currency: "usd" } },
    idempotencyKey: "op_1",
  });
  assert.equal(r.ok, true);
  assert.equal(sink[0].init.method, "POST");
  const headers = sink[0].init.headers as Record<string, string>;
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers["Idempotency-Key"], "op_1");
  const body = JSON.parse(String(sink[0].init.body));
  assert.equal(body.amount.value, 100);
});

test("network error returns network_error", async () => {
  const fetchImpl = (async () => {
    throw new Error("boom");
  }) as unknown as typeof fetch;
  const r = await stripeV2Request("GET", "/v2/x", { secretKey: "sk_test_x", fetchImpl });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.code, "network_error");
});

/**
 * Stale stored Stripe customer (staging sandbox switch: "No such customer: 'cus_...'").
 * mock.module is unusable under tsx, so the behaviour is pinned on the pure helper with
 * a typed fake, and the getOrCreate*StripeCustomer wiring is pinned by source.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type Stripe from "stripe";
import { storedCustomerIsStale } from "./stored-customer";
import { createTranslator } from "@/i18n/messages";

type Reader = Parameters<typeof storedCustomerIsStale>[0];
type Outcome = { value: Stripe.Customer | Stripe.DeletedCustomer } | { error: Error & { code?: string; statusCode?: number } };

function fake(outcome: Outcome): { stripe: Reader; calls: string[] } {
  const calls: string[] = [];
  const stripe = {
    customers: {
      retrieve: async (id: string) => {
        calls.push(id);
        if ("error" in outcome) throw outcome.error;
        return outcome.value;
      },
    },
  } as unknown as Reader;
  return { stripe, calls };
}
const stripeErr = (message: string, extra: { code?: string; statusCode?: number }) => Object.assign(new Error(message), extra);

describe("storedCustomerIsStale", () => {
  it("a live customer is reused (not stale)", async () => {
    const f = fake({ value: { id: "cus_ok", object: "customer" } as Stripe.Customer });
    assert.equal(await storedCustomerIsStale(f.stripe, "cus_ok"), false);
    assert.deepEqual(f.calls, ["cus_ok"]);
  });
  it("a deleted customer is stale", async () => {
    const f = fake({ value: { id: "cus_x", object: "customer", deleted: true } as Stripe.DeletedCustomer });
    assert.equal(await storedCustomerIsStale(f.stripe, "cus_x"), true);
  });
  it("resource_missing (id from another sandbox) is stale", async () => {
    const f = fake({ error: stripeErr("No such customer: 'cus_other'", { code: "resource_missing", statusCode: 404 }) });
    assert.equal(await storedCustomerIsStale(f.stripe, "cus_other"), true);
  });
  it("any other Stripe error stays an error", async () => {
    const f = fake({ error: stripeErr("Rate limit", { code: "rate_limit", statusCode: 429 }) });
    await assert.rejects(() => storedCustomerIsStale(f.stripe, "cus_a"), /Rate limit/);
    const g = fake({ error: stripeErr("Invalid API Key", { code: "api_key_invalid", statusCode: 401 }) });
    await assert.rejects(() => storedCustomerIsStale(g.stripe, "cus_a"), /Invalid API Key/);
  });
});

describe("getOrCreate*StripeCustomer wiring", () => {
  const files: Array<[string, string, string]> = [
    ["talent-billing.ts", "talent_stripe_customers", "user_id"],
    ["workspace-billing.ts", "stripe_customers", "tenant_id"],
    ["client-billing.ts", "client_stripe_customers", "user_id"],
  ];
  for (const [file, table, col] of files) {
    it(`${file} verifies the stored id and replaces a stale mapping by upsert`, () => {
      const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      assert.match(src, /storedCustomerIsStale\(stripe, existing\.stripe_customer_id\)/);
      assert.match(src, new RegExp(`from\\("${table}"\\)\\.upsert\\(row, \\{ onConflict: "${col}" \\}\\)`));
      assert.match(src, new RegExp(`from\\("${table}"\\)\\.insert\\(row\\)`));
      assert.match(src, /getOrCreateCustomer\.stale/);
    });
  }
  for (const file of ["talent-billing.ts", "workspace-billing.ts"]) {
    it(`${file} localises the checkout errors`, () => {
      const src = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      assert.match(src, /checkoutFailed/);
      assert.match(src, /checkoutNoUrl/);
    });
  }
  it("checkout error copy exists in EN and ES", () => {
    assert.equal(createTranslator("en")("admin.account.billing.checkoutFailed"), "Could not create checkout session.");
    assert.equal(createTranslator("en")("admin.account.billing.checkoutNoUrl"), "Stripe returned no checkout URL.");
    assert.equal(createTranslator("es")("admin.account.billing.checkoutFailed"), "No se pudo crear la sesión de pago.");
    assert.equal(createTranslator("es-MX")("admin.account.billing.checkoutNoUrl"), "Stripe no devolvió un enlace de pago.");
  });
});

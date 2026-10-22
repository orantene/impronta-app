/** TUL-284/1700: a rent subscription is only created in a currency the studio's Stripe lane settles. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { classifyCreator, ALLOW_LIST, GUARDED_CREATORS } from "../../payments/checkout-currency-guard.static.test";
import { checkTenantChargeCurrency } from "../../payments/seller-currency-guard";

function fakeSb(result: { data?: unknown; error?: unknown } | "throw") {
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => {
      if (result === "throw") throw new Error("boom");
      return { data: result.data ?? null, error: result.error ?? null };
    },
  });
  return { from: () => q } as never;
}
const lane = (stripe_account_platform: string) => ({ data: { stripe_account_platform } });

describe("checkTenantChargeCurrency", () => {
  test("the MX lane settles MXN and USD; the US lane settles USD only", async () => {
    assert.deepEqual(await checkTenantChargeCurrency(fakeSb(lane("mx")), { tenantId: "t", currency: "mxn" }), { ok: true });
    assert.deepEqual(await checkTenantChargeCurrency(fakeSb(lane("mx")), { tenantId: "t", currency: "USD" }), { ok: true });
    assert.deepEqual(await checkTenantChargeCurrency(fakeSb(lane("us")), { tenantId: "t", currency: "USD" }), { ok: true });
    const bad = await checkTenantChargeCurrency(fakeSb(lane("us")), { tenantId: "t", currency: "MXN" });
    assert.equal(bad.ok, false);
    assert.equal(bad.ok === false && bad.code, "charge_currency_unsupported_for_lane");
  });
  test("a currency no lane supports is refused", async () => {
    assert.equal((await checkTenantChargeCurrency(fakeSb(lane("mx")), { tenantId: "t", currency: "EUR" })).ok, false);
    assert.equal((await checkTenantChargeCurrency(fakeSb(lane("mx")), { tenantId: "t", currency: null })).ok, false);
  });
  test("fails CLOSED: no client, a read error, a thrown read, or no studio row", async () => {
    for (const sb of [null, fakeSb({ error: { message: "x" } }), fakeSb("throw"), fakeSb({ data: null })]) {
      const r = await checkTenantChargeCurrency(sb as never, { tenantId: "t", currency: "MXN" });
      assert.equal(r.ok, false);
      assert.equal(r.ok === false && r.code, "seller_currency_unreadable");
    }
  });
});

describe("the start action", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/service-hub/rent/rent-autopay-actions.ts"), "utf8");
  test("runs the guard before the Checkout session is created", () => {
    assert.ok(src.indexOf("checkTenantChargeCurrency(") > 0);
    assert.ok(src.indexOf("checkTenantChargeCurrency(") < src.indexOf("stripe.checkout.sessions.create("));
  });
  test("is a GUARDED creator (not allow-listed), and the classifier passes it", () => {
    assert.ok(GUARDED_CREATORS.has("src/lib/service-hub/rent/rent-autopay-actions.ts"));
    assert.equal(ALLOW_LIST["src/lib/service-hub/rent/rent-autopay-actions.ts"], undefined);
    assert.deepEqual(classifyCreator("src/lib/service-hub/rent/rent-autopay-actions.ts", src, GUARDED_CREATORS, ALLOW_LIST), []);
  });
});

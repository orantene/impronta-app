/**
 * global-payouts — v2 Money Movement helpers (fetch monkeypatched, no network).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getPrimaryFinancialAccountId,
  createOutboundPayment,
  outboundPaymentLedgerStatus,
  _resetFinancialAccountCache,
} from "@/lib/payments/global-payouts";

function withFakeFetch(
  status: number,
  jsonBody: unknown,
): { restore: () => void; calls: Array<{ url: string; init: RequestInit }> } {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const prevFetch = globalThis.fetch;
  const prevKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  const impl = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return { ok: status >= 200 && status < 300, status, json: async () => jsonBody };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = impl as any;
  return {
    calls,
    restore: () => {
      globalThis.fetch = prevFetch;
      if (prevKey === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = prevKey;
    },
  };
}

test("outboundPaymentLedgerStatus maps lifecycle → ledger status", () => {
  assert.equal(outboundPaymentLedgerStatus("posted"), "transferred");
  assert.equal(outboundPaymentLedgerStatus("processing"), "transferred");
  assert.equal(outboundPaymentLedgerStatus("failed"), "failed");
  assert.equal(outboundPaymentLedgerStatus("returned"), "failed");
  assert.equal(outboundPaymentLedgerStatus("canceled"), "failed");
  assert.equal(outboundPaymentLedgerStatus("unknown_future"), "held");
});

test("getPrimaryFinancialAccountId returns the first FA id", async () => {
  const fx = withFakeFetch(200, {
    data: [{ id: "fa_test_1" }, { id: "fa_test_2" }],
    next_page_url: null,
    previous_page_url: null,
  });
  _resetFinancialAccountCache();
  const id = await getPrimaryFinancialAccountId({ force: true });
  assert.equal(id, "fa_test_1");
  fx.restore();
  _resetFinancialAccountCache();
});

test("getPrimaryFinancialAccountId returns null when no FA (GP not activated)", async () => {
  const fx = withFakeFetch(200, { data: [], next_page_url: null, previous_page_url: null });
  _resetFinancialAccountCache();
  const id = await getPrimaryFinancialAccountId({ force: true });
  assert.equal(id, null);
  fx.restore();
  _resetFinancialAccountCache();
});

test("createOutboundPayment posts the correct v2 body + idempotency key", async () => {
  const fx = withFakeFetch(200, {
    id: "obp_1",
    object: "v2.money_management.outbound_payment",
    status: "processing",
    amount: { value: 80000, currency: "usd" },
  });
  const r = await createOutboundPayment({
    financialAccountId: "fa_1",
    recipientAccountId: "acct_r",
    amountCents: 80000,
    currency: "USD",
    idempotencyKey: "op_x",
    metadata: { booking_id: "bk_1" },
  });
  assert.equal(r.ok, true);
  const body = JSON.parse(String(fx.calls[0].init.body));
  assert.equal(body.from.financial_account, "fa_1");
  assert.equal(body.from.currency, "usd");
  assert.equal(body.to.recipient, "acct_r");
  assert.equal(body.amount.value, 80000);
  assert.equal(body.amount.currency, "usd");
  assert.equal(body.metadata.booking_id, "bk_1");
  const headers = fx.calls[0].init.headers as Record<string, string>;
  assert.equal(headers["Idempotency-Key"], "op_x");
  assert.match(fx.calls[0].url, /\/v2\/money_management\/outbound_payments$/);
  fx.restore();
});

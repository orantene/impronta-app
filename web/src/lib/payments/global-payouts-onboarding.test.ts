/**
 * global-payouts-onboarding — request-shape tests (fetch monkeypatched, no network).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createGlobalPayoutsRecipient,
  createRecipientBankPayoutMethod,
  getOrCreateFinancialAddress,
  fundFinancialAccountFromBalance,
} from "@/lib/payments/global-payouts-onboarding";

type Call = { url: string; init: RequestInit };

/** Monkeypatch globalThis.fetch with a per-(url,method) router; set a test key. */
function withRouter(
  routes: Array<{ match: string; method?: string; status?: number; body: unknown }>,
): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const prevFetch = globalThis.fetch;
  const prevKey = process.env.STRIPE_SECRET_KEY;
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  const impl = async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const m = init?.method ?? "GET";
    calls.push({ url: u, init: init ?? {} });
    const route = routes.find((r) => u.includes(r.match) && (!r.method || r.method === m));
    const status = route?.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => route?.body ?? {} };
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

test("createGlobalPayoutsRecipient posts the recipient config + lowercased country", async () => {
  const r = withRouter([{ match: "/v2/core/accounts", method: "POST", body: { id: "acct_r", object: "v2.core.account" } }]);
  const res = await createGlobalPayoutsRecipient({
    email: "t@example.com",
    displayName: "T Talent",
    country: "MX",
    metadata: { qa: "1" },
  });
  assert.equal(res.ok, true);
  const body = JSON.parse(String(r.calls[0].init.body));
  assert.equal(body.identity.country, "mx");
  assert.equal(body.identity.entity_type, "individual");
  assert.equal(body.configuration.recipient.capabilities.bank_accounts.local.requested, true);
  assert.equal(body.metadata.qa, "1");
  r.restore();
});

test("createRecipientBankPayoutMethod uses outbound_setup_intents + Stripe-Context", async () => {
  const r = withRouter([
    { match: "/v2/money_management/outbound_setup_intents", method: "POST", body: { id: "obsi_1", object: "v2.money_management.outbound_setup_intent" } },
  ]);
  const res = await createRecipientBankPayoutMethod({
    recipientAccountId: "acct_r",
    bank: { country: "us", accountNumber: "000123456789", routingNumber: "110000000" },
  });
  assert.equal(res.ok, true);
  const headers = r.calls[0].init.headers as Record<string, string>;
  assert.equal(headers["Stripe-Context"], "acct_r");
  const body = JSON.parse(String(r.calls[0].init.body));
  assert.equal(body.payout_method_data.type, "bank_account");
  assert.equal(body.payout_method_data.bank_account.country, "US");
  assert.equal(body.payout_method_data.bank_account.routing_number, "110000000");
  r.restore();
});

test("getOrCreateFinancialAddress returns existing when present (no POST)", async () => {
  const r = withRouter([
    { match: "/v2/money_management/financial_addresses", method: "GET", body: { data: [{ id: "finaddr_1", object: "v2.fa" }] } },
  ]);
  const res = await getOrCreateFinancialAddress("fa_1");
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.data.id, "finaddr_1");
  assert.ok(!r.calls.some((c) => (c.init.method ?? "GET") === "POST"), "no create when one exists");
  r.restore();
});

test("getOrCreateFinancialAddress creates a us_bank_account address when none exist", async () => {
  const r = withRouter([
    { match: "/v2/money_management/financial_addresses", method: "GET", body: { data: [] } },
    { match: "/v2/money_management/financial_addresses", method: "POST", body: { id: "finaddr_new", object: "v2.fa" } },
  ]);
  const res = await getOrCreateFinancialAddress("fa_1");
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.data.id, "finaddr_new");
  const post = r.calls.find((c) => c.init.method === "POST");
  const body = JSON.parse(String(post?.init.body));
  assert.equal(body.financial_account, "fa_1");
  assert.equal(body.type, "us_bank_account");
  r.restore();
});

test("getOrCreateFinancialAddress errors when GP not active (no FA id)", async () => {
  const r = withRouter([
    { match: "/v2/money_management/financial_accounts", method: "GET", body: { data: [] } },
  ]);
  const res = await getOrCreateFinancialAddress(null);
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.error.code, "no_financial_account");
  r.restore();
});

test("fundFinancialAccountFromBalance posts a v1 payout to the FA", async () => {
  const r = withRouter([{ match: "/v1/payouts", method: "POST", body: { id: "po_1" } }]);
  const res = await fundFinancialAccountFromBalance({ financialAccountId: "fa_1", amountCents: 5000, currency: "USD" });
  assert.equal(res.ok, true);
  if (res.ok) assert.equal(res.payoutId, "po_1");
  const body = String(r.calls[0].init.body);
  assert.match(body, /payout_method=fa_1/);
  assert.match(body, /amount=5000/);
  assert.match(body, /currency=usd/);
  r.restore();
});

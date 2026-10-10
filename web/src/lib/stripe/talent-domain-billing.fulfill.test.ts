/**
 * fulfillTalentDomainPurchase — webhook fulfilment (mocked Registrar + Vercel).
 *
 * Run: npm run test:wt -- src/lib/stripe/talent-domain-billing.fulfill.test.ts
 */
import assert from "node:assert/strict";
import test from "node:test";

import type { DomainBuyResult } from "@/lib/saas/vercel-domains-registrar";
import type { VercelDomainSyncResult } from "@/lib/saas/custom-domain-actions";

import { fulfillTalentDomainPurchase } from "./talent-domain-billing";

const CONTACT_META = {
  contact_first_name: "Ada",
  contact_last_name: "Lovelace",
  contact_email: "ada@example.com",
  contact_phone: "+15551234567",
  contact_address1: "1 Analytical Engine Rd",
  contact_address2: "",
  contact_city: "London",
  contact_state: "LDN",
  contact_zip: "SW1A",
  contact_country: "GB",
};

type Row = Record<string, unknown>;

function makeFakeSb(opts: {
  bySession?: Row | null;
  byDomain?: Row | null;
  onInsert?: (row: Row) => void;
  onUpdate?: (row: Row) => void;
}) {
  const state = {
    inserts: [] as Row[],
    updates: [] as Row[],
  };

  // Track call index so by-session then by-domain selects resolve correctly.
  let selectCalls = 0;
  const client = {
    from(table: string) {
      assert.equal(table, "talent_site_domains");
      selectCalls += 1;
      const call = selectCalls;
      const filters: Record<string, unknown> = {};
      let mode: "select" | "update" | "insert" = "select";
      let updateRow: Row | null = null;

      const api = {
        select() {
          mode = "select";
          return api;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          if (mode === "update" && updateRow) {
            return {
              eq: async () => {
                state.updates.push(updateRow!);
                opts.onUpdate?.(updateRow!);
                return { error: null };
              },
            };
          }
          return api;
        },
        maybeSingle: async () => {
          if (filters.stripe_checkout_session_id != null || call === 1) {
            return { data: opts.bySession ?? null, error: null };
          }
          return { data: opts.byDomain ?? null, error: null };
        },
        update(row: Row) {
          mode = "update";
          updateRow = row;
          return {
            eq: async () => {
              state.updates.push(row);
              opts.onUpdate?.(row);
              return { error: null };
            },
          };
        },
        insert(row: Row) {
          mode = "insert";
          state.inserts.push(row);
          opts.onInsert?.(row);
          return Promise.resolve({ error: null });
        },
      };
      return api;
    },
    _state: state,
  };

  return client;
}

const bought: DomainBuyResult = {
  attempted: true,
  purchased: true,
  orderId: "ord_test_1",
  skippedReason: null,
  errorCode: null,
  errorMessage: null,
};

const attached: VercelDomainSyncResult = {
  attempted: true,
  attached: true,
  verified: true,
  alreadyExists: false,
  skippedReason: null,
  errorCode: null,
  errorMessage: null,
  challenges: [],
};

test("fulfill: happy path buys, attaches, inserts dns_verification_sent row", async () => {
  const sb = makeFakeSb({});
  const refunds: string[] = [];

  const result = await fulfillTalentDomainPurchase(
    {
      sessionId: "cs_1",
      talentProfileId: "talent-1",
      domain: "Studio.Example",
      expectedPriceCents: 1200,
      amountTotal: 1200,
      currency: "usd",
      paymentIntentId: "pi_1",
      metadata: CONTACT_META,
    },
    {
      createClient: () => sb as never,
      buyDomain: async () => bought,
      ensureCustomDomainOnVercelProject: async () => attached,
      refundPaymentIntent: async (pi) => {
        if (pi) refunds.push(pi);
      },
      mintVerificationToken: () => "impronta-verify-fixed",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.orderId, "ord_test_1");
  assert.equal(refunds.length, 0);
  assert.equal(sb._state.inserts.length, 1);
  const row = sb._state.inserts[0]!;
  assert.equal(row.domain, "studio.example");
  assert.equal(row.status, "dns_verification_sent");
  assert.equal(row.verification_token, "impronta-verify-fixed");
  assert.equal(row.acquisition, "purchased");
  assert.equal(row.vercel_order_id, "ord_test_1");
  assert.equal(row.stripe_checkout_session_id, "cs_1");
});

test("fulfill: idempotent when session already has vercel_order_id", async () => {
  const sb = makeFakeSb({
    bySession: { id: "dom-1", vercel_order_id: "ord_existing", status: "active" },
  });
  let buyCalls = 0;

  const result = await fulfillTalentDomainPurchase(
    {
      sessionId: "cs_done",
      talentProfileId: "talent-1",
      domain: "studio.example",
      expectedPriceCents: 1200,
      amountTotal: 1200,
      currency: "usd",
      paymentIntentId: "pi_1",
      metadata: CONTACT_META,
    },
    {
      createClient: () => sb as never,
      buyDomain: async () => {
        buyCalls += 1;
        return bought;
      },
      ensureCustomDomainOnVercelProject: async () => attached,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.orderId, "ord_existing");
  assert.equal(buyCalls, 0);
  assert.equal(sb._state.inserts.length, 0);
});

test("fulfill: amount mismatch refunds and writes error row (acks)", async () => {
  const sb = makeFakeSb({});
  const refunds: string[] = [];

  const result = await fulfillTalentDomainPurchase(
    {
      sessionId: "cs_bad",
      talentProfileId: "talent-1",
      domain: "studio.example",
      expectedPriceCents: 1200,
      amountTotal: 999,
      currency: "usd",
      paymentIntentId: "pi_bad",
      metadata: CONTACT_META,
    },
    {
      createClient: () => sb as never,
      buyDomain: async () => {
        throw new Error("buy must not run");
      },
      refundPaymentIntent: async (pi) => {
        if (pi) refunds.push(pi);
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.orderId, null);
  assert.deepEqual(refunds, ["pi_bad"]);
  assert.equal(sb._state.inserts[0]?.status, "error");
  assert.match(String(sb._state.inserts[0]?.failure_reason), /amount mismatch/i);
});

test("fulfill: registrar reject refunds and acks (no Stripe retry storm)", async () => {
  const sb = makeFakeSb({});
  const refunds: string[] = [];

  const result = await fulfillTalentDomainPurchase(
    {
      sessionId: "cs_reg",
      talentProfileId: "talent-1",
      domain: "studio.example",
      expectedPriceCents: 1200,
      amountTotal: 1200,
      currency: "usd",
      paymentIntentId: "pi_reg",
      metadata: CONTACT_META,
    },
    {
      createClient: () => sb as never,
      buyDomain: async () => ({
        attempted: true,
        purchased: false,
        orderId: null,
        skippedReason: null,
        errorCode: "domain_not_available",
        errorMessage: "Taken",
      }),
      refundPaymentIntent: async (pi) => {
        if (pi) refunds.push(pi);
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.orderId, null);
  assert.deepEqual(refunds, ["pi_reg"]);
  assert.equal(sb._state.inserts[0]?.status, "error");
});

test("fulfill: attach failure → error status row, still returns orderId", async () => {
  const sb = makeFakeSb({});

  const result = await fulfillTalentDomainPurchase(
    {
      sessionId: "cs_attach",
      talentProfileId: "talent-1",
      domain: "studio.example",
      expectedPriceCents: 1200,
      amountTotal: 1200,
      currency: "usd",
      paymentIntentId: "pi_1",
      metadata: CONTACT_META,
    },
    {
      createClient: () => sb as never,
      buyDomain: async () => bought,
      ensureCustomDomainOnVercelProject: async () => ({
        attempted: true,
        attached: false,
        verified: null,
        alreadyExists: false,
        skippedReason: null,
        errorCode: "domain_taken_elsewhere",
        errorMessage: "used elsewhere",
        challenges: [],
      }),
      mintVerificationToken: () => "tok",
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.orderId, "ord_test_1");
  assert.equal(sb._state.inserts[0]?.status, "error");
  assert.equal(sb._state.inserts[0]?.failure_reason, "used elsewhere");
});

test("validate contact missing → refund + error ack", async () => {
  const sb = makeFakeSb({});
  const refunds: string[] = [];

  const result = await fulfillTalentDomainPurchase(
    {
      sessionId: "cs_nocontact",
      talentProfileId: "talent-1",
      domain: "studio.example",
      expectedPriceCents: 1200,
      amountTotal: 1200,
      currency: "usd",
      paymentIntentId: "pi_nc",
      metadata: { contact_email: "not-an-email" },
    },
    {
      createClient: () => sb as never,
      refundPaymentIntent: async (pi) => {
        if (pi) refunds.push(pi);
      },
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.orderId, null);
  assert.deepEqual(refunds, ["pi_nc"]);
});

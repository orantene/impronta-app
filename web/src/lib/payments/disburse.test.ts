/**
 * disburse — rail router unit tests (no network).
 *
 * The Connect rail must preserve the EXACT idempotency key + status semantics of
 * the original payParty (so the live payout path is unchanged). The Global
 * Payouts rail builds an OutboundPayment via an injected executor.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  disburse,
  connectIdempotencyKey,
  outboundIdempotencyKey,
  type DisburseInput,
  type DisburseDeps,
} from "@/lib/payments/disburse";

const BK = "bk_1";

function connectInput(over: Partial<DisburseInput> = {}): DisburseInput {
  return {
    party: "talent",
    participantId: "p1",
    bookingId: BK,
    amountCents: 80000,
    currency: "usd",
    route: { rail: "connect_transfer", connectAccountId: "acct_1" },
    ...over,
  };
}

function fakeStripe() {
  const calls: { params: Record<string, unknown>; idempotencyKey?: string }[] = [];
  const client = {
    transfers: {
      create: async (params: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
        calls.push({ params, idempotencyKey: options?.idempotencyKey });
        return { id: `tr_${calls.length}` };
      },
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { calls, stripe: client as any };
}

test("connect rail: transfers.create with the stable idempotency key", async () => {
  const { calls, stripe } = fakeStripe();
  const o = await disburse(connectInput(), { stripe });
  assert.equal(o.rail, "connect_transfer");
  assert.equal(o.status, "transferred");
  assert.equal(o.destination, "acct_1");
  assert.equal(o.transferId, "tr_1");
  assert.equal(calls[0].idempotencyKey, connectIdempotencyKey(BK, "p1", "talent"));
  assert.equal(calls[0].params.amount, 80000);
  assert.equal(calls[0].params.destination, "acct_1");
});

test("connect rail: no account → skipped_no_account (held), no Stripe call", async () => {
  const { calls, stripe } = fakeStripe();
  const o = await disburse(
    connectInput({ route: { rail: "connect_transfer", connectAccountId: null } }),
    { stripe },
  );
  assert.equal(o.status, "skipped_no_account");
  assert.match(o.detail ?? "", /held on platform/i);
  assert.equal(calls.length, 0);
});

test("connect rail: no stripe client → mock", async () => {
  const o = await disburse(connectInput(), { stripe: null });
  assert.equal(o.status, "mock");
  assert.equal(o.destination, "acct_1");
});

test("zero amount → skipped_zero", async () => {
  const { stripe } = fakeStripe();
  const o = await disburse(connectInput({ amountCents: 0 }), { stripe });
  assert.equal(o.status, "skipped_zero");
});

test("global_payouts rail: OutboundPayment via injected executor", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const createOutboundPaymentFn: DisburseDeps["createOutboundPaymentFn"] = async (args) => {
    calls.push(args as unknown as Record<string, unknown>);
    return {
      ok: true,
      data: {
        id: "obp_1",
        object: "v2.money_management.outbound_payment",
        status: "posted",
        amount: { value: args.amountCents, currency: args.currency },
      },
    };
  };
  const o = await disburse(
    {
      party: "talent",
      participantId: "p9",
      bookingId: BK,
      amountCents: 80000,
      currency: "usd",
      route: {
        rail: "global_payouts",
        financialAccountId: "fa_1",
        recipientAccountId: "acct_r",
        payoutMethodId: null,
      },
    },
    { createOutboundPaymentFn, isV2Configured: () => true },
  );
  assert.equal(o.rail, "global_payouts");
  assert.equal(o.status, "transferred");
  assert.equal(o.destination, "acct_r");
  assert.equal(o.transferId, "obp_1");
  assert.equal(calls[0].financialAccountId, "fa_1");
  assert.equal(calls[0].recipientAccountId, "acct_r");
  assert.equal(calls[0].idempotencyKey, outboundIdempotencyKey(BK, "p9", "talent"));
});

test("global_payouts rail: missing FA or recipient → skipped_no_account (held)", async () => {
  const o1 = await disburse(
    {
      party: "talent",
      participantId: "p1",
      bookingId: BK,
      amountCents: 80000,
      currency: "usd",
      route: { rail: "global_payouts", financialAccountId: null, recipientAccountId: "acct_r" },
    },
    { isV2Configured: () => true },
  );
  assert.equal(o1.status, "skipped_no_account");

  const o2 = await disburse(
    {
      party: "talent",
      participantId: "p1",
      bookingId: BK,
      amountCents: 80000,
      currency: "usd",
      route: { rail: "global_payouts", financialAccountId: "fa_1", recipientAccountId: null },
    },
    { isV2Configured: () => true },
  );
  assert.equal(o2.status, "skipped_no_account");
});

test("global_payouts rail: not configured → mock", async () => {
  const o = await disburse(
    {
      party: "talent",
      participantId: "p1",
      bookingId: BK,
      amountCents: 80000,
      currency: "usd",
      route: { rail: "global_payouts", financialAccountId: "fa_1", recipientAccountId: "acct_r" },
    },
    { isV2Configured: () => false },
  );
  assert.equal(o.status, "mock");
  assert.equal(o.destination, "acct_r");
});

test("global_payouts rail: executor error → failed", async () => {
  const createOutboundPaymentFn: DisburseDeps["createOutboundPaymentFn"] = async () => ({
    ok: false,
    status: 400,
    error: { code: "insufficient_funds", message: "no funds" },
  });
  const o = await disburse(
    {
      party: "talent",
      participantId: "p1",
      bookingId: BK,
      amountCents: 80000,
      currency: "usd",
      route: { rail: "global_payouts", financialAccountId: "fa_1", recipientAccountId: "acct_r" },
    },
    { createOutboundPaymentFn, isV2Configured: () => true },
  );
  assert.equal(o.status, "failed");
  assert.match(o.detail ?? "", /no funds/);
});

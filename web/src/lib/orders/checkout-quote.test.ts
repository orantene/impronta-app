/**
 * TUL-1268 item 5: the booking sheet shows the pass-through card fee BEFORE Stripe, and the
 * sheet's "pay now" total is the number Checkout collects (same function, not a re-derivation).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveCheckoutCollectCents } from "@/lib/orders/purchase-collect";
import type { ProcessorFeeRates } from "@/lib/billing/commission";
import { quoteCheckoutCollect } from "./checkout-quote";
import { cardFeeSummary } from "./checkout-quote-display";

const MX: ProcessorFeeRates = { percent: 0.036, fixed_cents: 300, tax_on_fee: 0.16 };

function collectAdmin(mode: "included" | "pass_through") {
  const rosterQuery = {
    select: () => rosterQuery,
    eq: () => rosterQuery,
    in: () => rosterQuery,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
  };
  return {
    from: () => rosterQuery,
    rpc: async (name: string) => {
      if (name === "engine_platform_processing_mode") {
        return { data: { processing_mode: mode, pass_through_take_bps: 150, processor_fee_rates: { mxn: MX } }, error: null };
      }
      return { data: "seller", error: null };
    },
  } as never;
}

const INPUT = {
  tenantId: "t",
  orderCurrency: "MXN",
  lines: [{ talentProfileId: "t1", ownerTenantId: null, talentCostCents: 100_000, totalCents: 100_000 }],
  subtotalCents: 100_000,
  totalCents: 100_000,
  collect: "full" as const,
  depositPct: null,
  payInPerson: false,
};

async function withPassThrough<T>(on: boolean, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.COMMISSION_PROCESSING_PASS_THROUGH;
  if (on) process.env.COMMISSION_PROCESSING_PASS_THROUGH = "1";
  else delete process.env.COMMISSION_PROCESSING_PASS_THROUGH;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.COMMISSION_PROCESSING_PASS_THROUGH;
    else process.env.COMMISSION_PROCESSING_PASS_THROUGH = prev;
  }
}

describe("sheet total === the Checkout collect total", () => {
  it("pass-through: the sheet shows the fee and its pay-now total equals resolveCheckoutCollectCents", async () => {
    await withPassThrough(true, async () => {
      const checkout = await resolveCheckoutCollectCents(collectAdmin("pass_through"), INPUT);
      const quote = await quoteCheckoutCollect(collectAdmin("pass_through"), INPUT);
      const sheet = cardFeeSummary(quote);
      assert.ok(sheet, "a fee row is shown");
      assert.equal(sheet.payNowCents, checkout.collectCents);
      assert.equal(sheet.feeCents, checkout.collectCents - checkout.baseCollectCents);
      assert.ok(sheet.feeCents > 0);
      assert.equal(sheet.principalCents + sheet.feeCents, sheet.payNowCents);
    });
  });

  it("not pass-through: no fee row, and the total is the unchanged principal", async () => {
    await withPassThrough(false, async () => {
      const checkout = await resolveCheckoutCollectCents(collectAdmin("included"), INPUT);
      const quote = await quoteCheckoutCollect(collectAdmin("included"), INPUT);
      assert.equal(quote.collectCents, checkout.collectCents);
      assert.equal(quote.collectCents, 100_000);
      assert.equal(quote.cardFeeCents, 0);
      assert.equal(cardFeeSummary(quote), null);
    });
  });

  it("pay in person never shows a fee", async () => {
    await withPassThrough(true, async () => {
      const quote = await quoteCheckoutCollect(collectAdmin("pass_through"), { ...INPUT, payInPerson: true });
      assert.equal(quote.cardFeeCents, 0);
      assert.equal(cardFeeSummary(quote), null);
    });
  });

  it("deposit: the fee rides on the deposit, and the sheet pay-now equals the collect", async () => {
    await withPassThrough(true, async () => {
      const input = { ...INPUT, collect: "deposit" as const, depositPct: 30 };
      const checkout = await resolveCheckoutCollectCents(collectAdmin("pass_through"), input);
      const quote = await quoteCheckoutCollect(collectAdmin("pass_through"), input);
      assert.equal(cardFeeSummary(quote)?.payNowCents, checkout.collectCents);
      assert.equal(quote.principalCents, 30_000);
    });
  });
});

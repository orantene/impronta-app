/**
 * Unit tests for the W6a offer-commercial-terms pure derivation + normalization.
 *
 * Pure logic — no mocks, no DB. Pins down:
 *   - deposit-amount derivation (round, clamp to [0, total])
 *   - balance-method → depositPct invariants (pay_in_place=0, full_upfront=100)
 *   - defaulting from the W5 resolver (deposit %, refund policy, inferred method)
 *   - normalizeOfferTerms: untrusted input → coherent terms + derived amount
 *   - readOfferTermsFromRow: row → terms, null when no terms set, re-derive amount
 *   - type guards for balance method + refund policy
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  clampDepositPct,
  defaultOfferTermsFromResolved,
  deriveDepositAmountCents,
  isBalanceCollectionMethod,
  isRefundPolicyKey,
  normalizeOfferTerms,
  readOfferTermsFromRow,
} from "./offer-commercial-terms";
import type {
  PlatformCommercialDefaults,
  TalentBookingTerms,
  TenantCommercialTerms,
} from "./commercial-terms-types";

const platform = (
  o: Partial<PlatformCommercialDefaults> = {},
): PlatformCommercialDefaults => ({
  defaultDepositPct: 10,
  defaultRefundPolicy: "tiered",
  instantBookDefault: false,
  ...o,
});

const tenant = (
  o: Partial<TenantCommercialTerms> = {},
): TenantCommercialTerms => ({
  depositPct: null,
  refundPolicy: null,
  instantBookEnabled: false,
  ...o,
});

const talent = (
  o: Partial<TalentBookingTerms> = {},
): TalentBookingTerms => ({
  depositPct: null,
  refundPolicy: null,
  instantBookOptIn: false,
  fixedRateCents: null,
  ...o,
});

const baseFallback = {
  depositPct: 25,
  balanceMethod: "request_in_messages" as const,
  refundPolicy: "tiered" as const,
};

describe("deriveDepositAmountCents", () => {
  it("computes round(total * pct / 100) in minor units", () => {
    assert.equal(deriveDepositAmountCents(100_00, 30), 30_00);
    assert.equal(deriveDepositAmountCents(100_00, 0), 0);
    assert.equal(deriveDepositAmountCents(100_00, 100), 100_00);
  });

  it("rounds half up", () => {
    // 9999 * 50 / 100 = 4999.5 → 5000
    assert.equal(deriveDepositAmountCents(99_99, 50), 50_00);
  });

  it("never returns negative or zero-total amounts", () => {
    assert.equal(deriveDepositAmountCents(0, 50), 0);
    assert.equal(deriveDepositAmountCents(-100, 50), 0);
    assert.equal(deriveDepositAmountCents(100_00, -10), 0);
  });

  it("clamps the pct to 0..100 and never exceeds the total", () => {
    assert.equal(deriveDepositAmountCents(100_00, 150), 100_00);
  });

  it("treats non-finite inputs as zero", () => {
    assert.equal(deriveDepositAmountCents(Number.NaN, 50), 0);
    assert.equal(deriveDepositAmountCents(100_00, Number.NaN), 0);
  });
});

describe("clampDepositPct", () => {
  it("clamps to 0..100; null/garbage → null", () => {
    assert.equal(clampDepositPct(50), 50);
    assert.equal(clampDepositPct(-5), 0);
    assert.equal(clampDepositPct(150), 100);
    assert.equal(clampDepositPct(null), null);
    assert.equal(clampDepositPct("30"), null);
    assert.equal(clampDepositPct(Number.NaN), null);
  });
});

describe("defaultOfferTermsFromResolved", () => {
  it("uses the platform default deposit + refund policy when nothing overrides", () => {
    const d = defaultOfferTermsFromResolved({
      platform: platform({ defaultDepositPct: 10, defaultRefundPolicy: "flexible" }),
      tenant: null,
      talent: null,
    });
    assert.equal(d.depositPct, 10);
    assert.equal(d.refundPolicy, "flexible");
    assert.equal(d.balanceMethod, "request_in_messages");
  });

  it("a tenant deposit override wins over the platform default", () => {
    const d = defaultOfferTermsFromResolved({
      platform: platform({ defaultDepositPct: 10 }),
      tenant: tenant({ depositPct: 40 }),
      talent: null,
    });
    assert.equal(d.depositPct, 40);
  });

  it("a talent preference wins over the tenant override", () => {
    const d = defaultOfferTermsFromResolved({
      platform: platform({ defaultDepositPct: 10 }),
      tenant: tenant({ depositPct: 40, refundPolicy: "strict" }),
      talent: talent({ depositPct: 60 }),
    });
    assert.equal(d.depositPct, 60);
    assert.equal(d.refundPolicy, "strict");
  });

  it("infers full_upfront when the resolved deposit is 100%", () => {
    const d = defaultOfferTermsFromResolved({
      platform: platform({ defaultDepositPct: 100 }),
      tenant: null,
      talent: null,
    });
    assert.equal(d.depositPct, 100);
    assert.equal(d.balanceMethod, "full_upfront");
  });

  it("a 0% deposit still defaults to request_in_messages, not pay_in_place", () => {
    const d = defaultOfferTermsFromResolved({
      platform: platform({ defaultDepositPct: 0 }),
      tenant: null,
      talent: null,
    });
    assert.equal(d.depositPct, 0);
    assert.equal(d.balanceMethod, "request_in_messages");
  });
});

describe("normalizeOfferTerms", () => {
  it("derives the deposit amount from the client total + pct", () => {
    const t = normalizeOfferTerms(
      { depositPct: 30, balanceMethod: "request_in_messages", refundPolicy: "tiered" },
      100_00,
      baseFallback,
    );
    assert.equal(t.depositPct, 30);
    assert.equal(t.depositAmountCents, 30_00);
    assert.equal(t.balanceMethod, "request_in_messages");
    assert.equal(t.refundPolicy, "tiered");
  });

  it("pay_in_place forces depositPct 0 and a 0 amount regardless of input", () => {
    const t = normalizeOfferTerms(
      { depositPct: 75, balanceMethod: "pay_in_place", refundPolicy: "flexible" },
      100_00,
      baseFallback,
    );
    assert.equal(t.depositPct, 0);
    assert.equal(t.depositAmountCents, 0);
    assert.equal(t.balanceMethod, "pay_in_place");
  });

  it("full_upfront forces depositPct 100 and the full amount", () => {
    const t = normalizeOfferTerms(
      { depositPct: 10, balanceMethod: "full_upfront", refundPolicy: "strict" },
      250_00,
      baseFallback,
    );
    assert.equal(t.depositPct, 100);
    assert.equal(t.depositAmountCents, 250_00);
    assert.equal(t.balanceMethod, "full_upfront");
    assert.equal(t.refundPolicy, "strict");
  });

  it("falls back for missing/garbage fields", () => {
    const t = normalizeOfferTerms(
      { depositPct: "nope", balanceMethod: "bogus", refundPolicy: 42 },
      80_00,
      baseFallback,
    );
    assert.equal(t.depositPct, 25); // from fallback
    assert.equal(t.balanceMethod, "request_in_messages");
    assert.equal(t.refundPolicy, "tiered");
    assert.equal(t.depositAmountCents, 20_00); // 25% of 8000
  });

  it("clamps an out-of-range supplied pct", () => {
    const t = normalizeOfferTerms(
      { depositPct: 250, balanceMethod: "request_in_messages" },
      100_00,
      baseFallback,
    );
    assert.equal(t.depositPct, 100);
    assert.equal(t.depositAmountCents, 100_00);
  });
});

describe("readOfferTermsFromRow", () => {
  it("returns null when the offer has no terms set (pre-W6a)", () => {
    assert.equal(
      readOfferTermsFromRow(
        {
          deposit_pct: null,
          deposit_amount_cents: null,
          balance_collection_method: null,
          refund_policy_key: null,
        },
        100_00,
      ),
      null,
    );
    assert.equal(readOfferTermsFromRow(null, 100_00), null);
  });

  it("reads the stored term columns, preferring the stored amount", () => {
    const t = readOfferTermsFromRow(
      {
        deposit_pct: 30,
        deposit_amount_cents: 3000,
        balance_collection_method: "request_in_messages",
        refund_policy_key: "flexible",
      },
      100_00,
    );
    assert.ok(t);
    assert.equal(t.depositPct, 30);
    assert.equal(t.depositAmountCents, 3000);
    assert.equal(t.balanceMethod, "request_in_messages");
    assert.equal(t.refundPolicy, "flexible");
  });

  it("re-derives the amount when the stored amount is missing", () => {
    const t = readOfferTermsFromRow(
      {
        deposit_pct: 40,
        deposit_amount_cents: null,
        balance_collection_method: "request_in_messages",
        refund_policy_key: "tiered",
      },
      200_00,
    );
    assert.ok(t);
    assert.equal(t.depositAmountCents, 80_00);
  });

  it("tolerates numeric columns arriving as strings (PostgREST numeric/bigint)", () => {
    const t = readOfferTermsFromRow(
      {
        deposit_pct: "50",
        deposit_amount_cents: "5000",
        balance_collection_method: "request_in_messages",
        refund_policy_key: "strict",
      },
      100_00,
    );
    assert.ok(t);
    assert.equal(t.depositPct, 50);
    assert.equal(t.depositAmountCents, 5000);
  });

  it("re-applies the method invariant on read (full_upfront → 100)", () => {
    const t = readOfferTermsFromRow(
      {
        deposit_pct: 10,
        deposit_amount_cents: null,
        balance_collection_method: "full_upfront",
        refund_policy_key: "tiered",
      },
      100_00,
    );
    assert.ok(t);
    assert.equal(t.depositPct, 100);
    assert.equal(t.depositAmountCents, 100_00);
  });
});

describe("type guards", () => {
  it("isBalanceCollectionMethod", () => {
    assert.equal(isBalanceCollectionMethod("request_in_messages"), true);
    assert.equal(isBalanceCollectionMethod("pay_in_place"), true);
    assert.equal(isBalanceCollectionMethod("full_upfront"), true);
    assert.equal(isBalanceCollectionMethod("nope"), false);
    assert.equal(isBalanceCollectionMethod(null), false);
  });

  it("isRefundPolicyKey", () => {
    assert.equal(isRefundPolicyKey("tiered"), true);
    assert.equal(isRefundPolicyKey("manual"), true);
    assert.equal(isRefundPolicyKey("bogus"), false);
  });
});

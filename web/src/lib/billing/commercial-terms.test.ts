/**
 * Unit tests for the commercial-terms resolver + safe parsers.
 *
 * Pure logic — no mocks, no DB. Pins down:
 *   - the layering (platform → tenant → talent), per-field, deepest non-null wins
 *   - resolvedFrom tracks the depositPct layer
 *   - instant-book gating (workspace switch AND talent opt-in; talent can't force)
 *   - fixedRateCents is talent-only
 *   - deposit clamping to 0..100
 *   - refundPolicy validation against the four keys
 *   - tolerant parsers on missing/garbage input + hard platform fallback
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  parsePlatformDefaults,
  parseTalentBookingTerms,
  parseTenantCommercialTerms,
  resolveCommercialTerms,
} from "./commercial-terms";
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
    directBookingOptIn: false,
  fixedRateCents: null,
  ...o,
});

describe("resolveCommercialTerms — layering", () => {
  it("uses the platform default when no tenant/talent terms exist", () => {
    const r = resolveCommercialTerms({
      platform: platform({ defaultDepositPct: 15, defaultRefundPolicy: "strict" }),
      tenant: null,
      talent: null,
    });
    assert.equal(r.depositPct, 15);
    assert.equal(r.refundPolicy, "strict");
    assert.equal(r.resolvedFrom, "platform_default");
    assert.equal(r.fixedRateCents, null);
  });

  it("tenant override wins over the platform default", () => {
    const r = resolveCommercialTerms({
      platform: platform({ defaultDepositPct: 10, defaultRefundPolicy: "tiered" }),
      tenant: tenant({ depositPct: 25, refundPolicy: "flexible" }),
      talent: null,
    });
    assert.equal(r.depositPct, 25);
    assert.equal(r.refundPolicy, "flexible");
    assert.equal(r.resolvedFrom, "tenant_override");
  });

  it("talent preference wins over tenant + platform", () => {
    const r = resolveCommercialTerms({
      platform: platform({ defaultDepositPct: 10 }),
      tenant: tenant({ depositPct: 25, refundPolicy: "flexible" }),
      talent: talent({ depositPct: 40, refundPolicy: "manual" }),
    });
    assert.equal(r.depositPct, 40);
    assert.equal(r.refundPolicy, "manual");
    assert.equal(r.resolvedFrom, "talent_preference");
  });

  it("falls through null fields to the next-shallower layer (per field)", () => {
    // talent supplies depositPct only; refundPolicy falls back to tenant.
    const r = resolveCommercialTerms({
      platform: platform({ defaultDepositPct: 10, defaultRefundPolicy: "tiered" }),
      tenant: tenant({ depositPct: 25, refundPolicy: "strict" }),
      talent: talent({ depositPct: 40, refundPolicy: null }),
    });
    assert.equal(r.depositPct, 40);
    assert.equal(r.refundPolicy, "strict"); // from tenant
    assert.equal(r.resolvedFrom, "talent_preference"); // tracks depositPct
  });

  it("resolvedFrom follows depositPct, not refundPolicy", () => {
    // tenant supplies refundPolicy only; depositPct still resolves from platform.
    const r = resolveCommercialTerms({
      platform: platform({ defaultDepositPct: 10 }),
      tenant: tenant({ depositPct: null, refundPolicy: "flexible" }),
      talent: null,
    });
    assert.equal(r.depositPct, 10);
    assert.equal(r.refundPolicy, "flexible");
    assert.equal(r.resolvedFrom, "platform_default");
  });

  it("carries fixedRateCents from the talent only", () => {
    const r = resolveCommercialTerms({
      platform: platform(),
      tenant: tenant({ depositPct: 25 }),
      talent: talent({ fixedRateCents: 500_00 }),
    });
    assert.equal(r.fixedRateCents, 500_00);
  });
});

describe("resolveCommercialTerms — instant-book gating", () => {
  it("uses the platform default when there is no tenant row", () => {
    const on = resolveCommercialTerms({
      platform: platform({ instantBookDefault: true }),
      tenant: null,
      talent: null,
    });
    assert.equal(on.instantBookEnabled, true);

    const off = resolveCommercialTerms({
      platform: platform({ instantBookDefault: false }),
      tenant: null,
      talent: talent({ instantBookOptIn: true }), // talent alone cannot force it
    });
    assert.equal(off.instantBookEnabled, false);
  });

  it("requires tenant ON; talent opt-in defaults to true with no talent row", () => {
    const r = resolveCommercialTerms({
      platform: platform({ instantBookDefault: false }),
      tenant: tenant({ instantBookEnabled: true }),
      talent: null,
    });
    assert.equal(r.instantBookEnabled, true);
  });

  it("tenant ON + talent opted IN → enabled", () => {
    const r = resolveCommercialTerms({
      platform: platform(),
      tenant: tenant({ instantBookEnabled: true }),
      talent: talent({ instantBookOptIn: true }),
    });
    assert.equal(r.instantBookEnabled, true);
  });

  it("tenant ON + talent opted OUT → disabled (talent veto)", () => {
    const r = resolveCommercialTerms({
      platform: platform(),
      tenant: tenant({ instantBookEnabled: true }),
      talent: talent({ instantBookOptIn: false }),
    });
    assert.equal(r.instantBookEnabled, false);
  });

  it("tenant OFF → disabled even if talent opted in", () => {
    const r = resolveCommercialTerms({
      platform: platform({ instantBookDefault: true }),
      tenant: tenant({ instantBookEnabled: false }),
      talent: talent({ instantBookOptIn: true }),
    });
    assert.equal(r.instantBookEnabled, false);
  });
});

describe("parseTenantCommercialTerms", () => {
  it("returns null on non-objects / garbage", () => {
    assert.equal(parseTenantCommercialTerms(null), null);
    assert.equal(parseTenantCommercialTerms("nope"), null);
    assert.equal(parseTenantCommercialTerms(42), null);
    assert.equal(parseTenantCommercialTerms([]), null);
  });

  it("returns null when nothing meaningful is set", () => {
    assert.equal(parseTenantCommercialTerms({}), null);
    assert.equal(
      parseTenantCommercialTerms({ commercialTerms: {} }),
      null,
    );
  });

  it("reads the nested commercialTerms node", () => {
    const r = parseTenantCommercialTerms({
      foo: "bar",
      commercialTerms: { depositPct: 30, refundPolicy: "strict", instantBookEnabled: true },
    });
    assert.deepEqual(r, {
      depositPct: 30,
      refundPolicy: "strict",
      instantBookEnabled: true,
    });
  });

  it("accepts an already-unwrapped node", () => {
    const r = parseTenantCommercialTerms({
      depositPct: 20,
      refundPolicy: "flexible",
      instantBookEnabled: false,
    });
    assert.deepEqual(r, {
      depositPct: 20,
      refundPolicy: "flexible",
      instantBookEnabled: false,
    });
  });

  it("clamps depositPct and rejects an invalid refund policy", () => {
    const r = parseTenantCommercialTerms({
      depositPct: 250,
      refundPolicy: "bogus",
      instantBookEnabled: true,
    });
    assert.equal(r?.depositPct, 100);
    assert.equal(r?.refundPolicy, null);
    assert.equal(r?.instantBookEnabled, true);
  });

  it("clamps a negative depositPct to 0", () => {
    const r = parseTenantCommercialTerms({ depositPct: -5, instantBookEnabled: true });
    assert.equal(r?.depositPct, 0);
  });
});

describe("parseTalentBookingTerms", () => {
  it("returns null on garbage / empty", () => {
    assert.equal(parseTalentBookingTerms(null), null);
    assert.equal(parseTalentBookingTerms("x"), null);
    assert.equal(parseTalentBookingTerms({}), null);
  });

  it("parses a full booking-terms object", () => {
    const r = parseTalentBookingTerms({
      depositPct: 50,
      refundPolicy: "manual",
      instantBookOptIn: true,
      fixedRateCents: 1_000_00,
    });
    assert.deepEqual(r, {
      depositPct: 50,
      refundPolicy: "manual",
      instantBookOptIn: true,
      fixedRateCents: 1_000_00,
      directBookingOptIn: false,
    });
  });

  it("clamps deposit, drops a bad policy, drops a negative rate", () => {
    const r = parseTalentBookingTerms({
      depositPct: 999,
      refundPolicy: 7,
      instantBookOptIn: "yes", // not strictly true → false
      fixedRateCents: -100,
    });
    assert.equal(r?.depositPct, 100);
    assert.equal(r?.refundPolicy, null);
    assert.equal(r?.instantBookOptIn, false);
    assert.equal(r?.fixedRateCents, null);
  });

  it("rounds a fractional fixedRateCents", () => {
    const r = parseTalentBookingTerms({ fixedRateCents: 12345.67 });
    assert.equal(r?.fixedRateCents, 12346);
  });
});

describe("parsePlatformDefaults", () => {
  it("falls back hard to {0,'tiered',false} on garbage", () => {
    assert.deepEqual(parsePlatformDefaults(null), {
      defaultDepositPct: 0,
      defaultRefundPolicy: "tiered",
      instantBookDefault: false,
    });
    assert.deepEqual(parsePlatformDefaults("nope"), {
      defaultDepositPct: 0,
      defaultRefundPolicy: "tiered",
      instantBookDefault: false,
    });
  });

  it("reads a valid platform_settings row", () => {
    const r = parsePlatformDefaults({
      default_deposit_pct: 20,
      default_refund_policy: "strict",
      instant_book_default: true,
    });
    assert.deepEqual(r, {
      defaultDepositPct: 20,
      defaultRefundPolicy: "strict",
      instantBookDefault: true,
    });
  });

  it("clamps deposit and falls back on an invalid policy", () => {
    const r = parsePlatformDefaults({
      default_deposit_pct: -10,
      default_refund_policy: "weird",
      instant_book_default: false,
    });
    assert.equal(r.defaultDepositPct, 0);
    assert.equal(r.defaultRefundPolicy, "tiered");
    assert.equal(r.instantBookDefault, false);
  });

  it("falls back deposit to 0 when the column is null/missing", () => {
    const r = parsePlatformDefaults({ default_refund_policy: "flexible" });
    assert.equal(r.defaultDepositPct, 0);
    assert.equal(r.defaultRefundPolicy, "flexible");
  });
});

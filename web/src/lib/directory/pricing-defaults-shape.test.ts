import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EMPTY_PRICING_DEFAULTS,
  parsePricingDefaults,
  pricingDefaultsToSettings,
  resolveStartingPrice,
  type TenantPricingDefaults,
} from "./pricing-defaults-shape";

const tenant: TenantPricingDefaults = {
  enabled: true,
  currency: "USD",
  globalFromCents: 20000,
  byTypeSlug: { "fashion-model": 15000 },
};

const base = {
  ownPrice: null,
  hasDeliberateQuoteOnly: false,
  primaryTypeSlug: null,
  tenantDefaults: tenant,
  platformFromCents: 9900,
  platformCurrency: "USD",
};

test("the talent's own price always wins, even against a lower default", () => {
  const r = resolveStartingPrice({
    ...base,
    ownPrice: { amountCents: 12000, currency: "MXN" },
    primaryTypeSlug: "fashion-model",
  });
  assert.deepEqual(r, { amountCents: 12000, currency: "MXN", source: "talent" });
});

test("a deliberate quote-only talent is NEVER given a default price", () => {
  // The consent gate. This talent published a service and chose "ask me";
  // no tenant or platform number may speak over that.
  assert.equal(
    resolveStartingPrice({
      ...base,
      hasDeliberateQuoteOnly: true,
      primaryTypeSlug: "fashion-model",
    }),
    null,
  );
});

test("type-specific tenant default beats the tenant-wide floor", () => {
  const r = resolveStartingPrice({ ...base, primaryTypeSlug: "fashion-model" });
  assert.deepEqual(r, {
    amountCents: 15000,
    currency: "USD",
    source: "tenant_default",
  });
});

test("an untyped talent falls to the tenant-wide floor", () => {
  const r = resolveStartingPrice({ ...base, primaryTypeSlug: "dancer" });
  assert.equal(r?.amountCents, 20000);
  assert.equal(r?.source, "tenant_default");
});

test("tenant switch off skips straight to the platform floor", () => {
  const r = resolveStartingPrice({
    ...base,
    tenantDefaults: { ...tenant, enabled: false },
    primaryTypeSlug: "fashion-model",
  });
  assert.deepEqual(r, {
    amountCents: 9900,
    currency: "USD",
    source: "platform_default",
  });
});

test("nothing configured anywhere renders nothing — never a guess", () => {
  assert.equal(
    resolveStartingPrice({
      ...base,
      tenantDefaults: EMPTY_PRICING_DEFAULTS,
      platformFromCents: null,
    }),
    null,
  );
});

test("parse rejects nonsense amounts instead of publishing them", () => {
  const parsed = parsePricingDefaults({
    directoryPricingDefaults: {
      enabled: true,
      currency: "usd",
      globalFromCents: 0, // below the floor
      byTypeSlug: { "fashion-model": 15000, dancer: -5, host: 99_999_999_99 },
    },
  });
  assert.equal(parsed.currency, "USD");
  assert.equal(parsed.globalFromCents, null);
  assert.deepEqual(parsed.byTypeSlug, { "fashion-model": 15000 });
});

test("parse is total — junk settings degrade to the disabled default", () => {
  for (const junk of [null, undefined, 42, "nope", {}, { directoryPricingDefaults: 7 }]) {
    assert.deepEqual(parsePricingDefaults(junk), EMPTY_PRICING_DEFAULTS);
  }
});

test("serialise never clobbers sibling settings namespaces", () => {
  const out = pricingDefaultsToSettings(
    { pageRoles: { home: "welcome" }, branding: { accent: "#fff" } },
    tenant,
  );
  assert.deepEqual(out.pageRoles, { home: "welcome" });
  assert.deepEqual(out.branding, { accent: "#fff" });
  assert.deepEqual(out.directoryPricingDefaults, tenant);
});

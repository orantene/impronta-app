import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DEFAULT_DISPLAY_CURRENCY } from "@/lib/billing/currencies";
import { formatPrice } from "./format-price";

const rates = { rateDate: "2026-10-17", perUsd: { MXN: 18, EUR: 0.9 } };

test("MXN is the default display currency", () => {
  assert.equal(DEFAULT_DISPLAY_CURRENCY, "MXN");
  assert.equal(formatPrice({ amountCents: 90000, locale: "es" }).primary, "$900 MXN");
  assert.equal(formatPrice({ amountCents: 90000, currency: " ", locale: "es" }).primary, "$900 MXN");
});

test("a non-USD price gets the ≈US$ line for talent editors, and for English public pages only", () => {
  const talent = formatPrice({ amountCents: 90000, currency: "MXN", locale: "es", audience: "talent", usdRates: rates });
  assert.equal(talent.secondary, "≈ US$50");
  assert.equal(formatPrice({ amountCents: 90000, currency: "MXN", locale: "en", audience: "public", usdRates: rates }).secondary, "≈ US$50");
  assert.equal(formatPrice({ amountCents: 90000, currency: "MXN", locale: "es", audience: "public", usdRates: rates }).secondary, null);
});

test("a USD price on a Spanish page gets the ≈MX$ line; English gets none; no rate means no line", () => {
  assert.equal(formatPrice({ amountCents: 900, currency: "USD", locale: "es", usdRates: rates }).secondary, "≈ MX$ 162");
  assert.equal(formatPrice({ amountCents: 900, currency: "USD", locale: "en", usdRates: rates }).secondary, null);
  assert.equal(formatPrice({ amountCents: 900, currency: "USD", locale: "es", usdRates: null }).secondary, null);
  assert.equal(formatPrice({ amountCents: 90000, currency: "MXN", locale: "en", usdRates: null }).secondary, null);
});

test("the copy/currency check is advisory: it always exits 0 and is a package script", () => {
  const script = readFileSync("scripts/check-copy-currency-warn.mjs", "utf8");
  assert.match(script, /process\.exit\(0\)/);
  assert.doesNotMatch(script, /process\.exit\([1-9]/);
  assert.match(readFileSync("package.json", "utf8"), /"manual:check-copy-warn": "node scripts\/check-copy-currency-warn\.mjs"/);
});

test("pricing ladders and the client account menu print through formatPrice", () => {
  assert.match(readFileSync("src/components/marketing/pricing-ladders-section.tsx", "utf8"), /formatPrice\(/);
  const acct = readFileSync("src/components/client-account/ClientAccountButton.tsx", "utf8");
  assert.match(acct, /formatPrice\(/);
  assert.doesNotMatch(acct, /new Intl\.NumberFormat/);
});

test("display-only call sites print through formatPrice, not an ad-hoc Intl currency call", () => {
  const files = [
    "src/app/(workspace)/[tenantSlug]/client/today/page.tsx",
    "src/app/(workspace)/[tenantSlug]/client/bookings/page.tsx",
    "src/app/(workspace)/[tenantSlug]/talent/settings/TalentServicesMenuCard.tsx",
    "src/app/(workspace)/[tenantSlug]/admin/financials/page.tsx",
    "src/app/(workspace)/[tenantSlug]/admin/channel-performance/page.tsx",
    "src/app/t/[profileCode]/talent-profile-instant-book-button.tsx",
    "src/components/admin/shell/internal/drawers/light-07.tsx",
    "src/components/reservation-thread/adapters/AdminThreadAdapter.tsx",
    "src/lib/search/global-search.ts",
    "src/lib/directory/format-price-from.ts",
    "src/lib/site-admin/builder-node/menu-board-island.tsx",
  ];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /formatPrice\(/, f);
    assert.doesNotMatch(src, /Intl\.NumberFormat\([^)]*\{[^}]*currency/, f);
  }
});

test("primary keeps symbol, amount and code", () => {
  assert.equal(formatPrice({ amountCents: 900, currency: "USD", locale: "en" }).primary, "$9 USD");
});

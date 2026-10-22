/**
 * TUL-1381: the Payouts-page warning for items priced in a currency the workspace's Stripe lane cannot charge.
 * Run: cd web && npm run test:wt -- src/lib/payments/lane-currency-items.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { itemsOutsideLane } from "./lane-currency-items";

const row = (over: Record<string, unknown> = {}) => ({
  id: "o1", title: "Clase de cocina", currency: "MXN", amount_cents: 25000, price_display: "exact", price_type: "flat_package", ...over,
});

test("a US-lane workspace lists its MXN items", () => {
  assert.deepEqual(itemsOutsideLane([row(), row({ id: "o2", title: "Tour", currency: "USD" })], "us"), [
    { id: "o1", title: "Clase de cocina", currency: "MXN" },
  ]);
});

test("the MX lane charges MXN and USD, so nothing is listed", () => {
  assert.deepEqual(itemsOutsideLane([row(), row({ id: "o2", currency: "USD" })], "mx"), []);
});

test("quote-priced, free and currency-less items are not listed", () => {
  assert.deepEqual(itemsOutsideLane([row({ price_display: "quote" }), row({ id: "b", price_type: "custom" }), row({ id: "c", amount_cents: 0 }), row({ id: "d", currency: null })], "us"), []);
});

test("the Payouts surface loads the mismatch and renders it with es copy", () => {
  const actions = readFileSync("src/app/(workspace)/[tenantSlug]/admin/payouts/payouts-surface-actions.ts", "utf8");
  assert.match(actions, /loadLaneMismatch\(admin, scope\.tenantId\)/);
  const client = readFileSync("src/app/(workspace)/[tenantSlug]/admin/payouts/payouts-section-client.tsx", "utf8");
  assert.match(client, /data-testid="lane-currency-mismatch"/);
  const i18n = readFileSync("src/components/admin/shell/internal/dashboard-i18n-money.ts", "utf8");
  assert.match(i18n, /solo cobra en USD\. Cambia el precio a USD o conecta una cuenta de México\./);
});

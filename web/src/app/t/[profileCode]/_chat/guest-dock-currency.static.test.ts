/**
 * TUL-1272 item 10: currency travels from the offering row to the dock row, and the dock
 * never hardcodes USD when it formats a price.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

test("GuestCatalogRow carries currency and the action maps it from the catalog row", () => {
  const src = read("app/t/[profileCode]/_actions/guest-catalog-actions.ts");
  assert.match(src, /export type GuestCatalogRow = \{[\s\S]*?currency\??: string \| null;/);
  assert.match(src, /currency: r\.currency \?\? null/);
});

test("the dock formats with the row's currency, never a hardcoded USD", () => {
  const src = read("app/t/[profileCode]/_chat/GuestDockCatalog.tsx");
  assert.doesNotMatch(src, /formatOrderMoney\([^)]*"USD"\)/);
  assert.match(src, /guestRowPriceLabel\(row\)/);
});

test("the tenant-wide offering reader selects currency so agency/hub rows are not USD by default", () => {
  const src = read("lib/messages-v5/items-catalog.ts");
  const fn = src.slice(src.indexOf("export async function loadOfferingRows"), src.indexOf("export async function loadTalentProfileOfferingRows"));
  assert.match(fn, /\.select\("id, title, amount_cents, currency,/);
  assert.match(fn, /currency: row\.currency/);
});

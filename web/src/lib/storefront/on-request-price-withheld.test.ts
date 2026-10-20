import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { publicPriceLine } from "@/lib/talent/public-price-line";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

// D-10a: on_request services stay shown to guests; the price is withheld.
test("D-10a: publicPriceLine withholds an on_request price and keeps a public one", () => {
  const base = { amountCents: 50000, currency: "MXN", priceDisplay: "exact" };
  assert.equal(publicPriceLine({ ...base, visibility: "on_request" }, "es"), null);
  assert.ok(publicPriceLine({ ...base, visibility: "public" }, "es"));
  assert.ok(publicPriceLine(base, "es"));
});

test("D-10a: /book passes visibility and never instant-books an on_request service", () => {
  const src = read("src/app/(public)/book/BookPageClient.tsx");
  assert.match(src, /visibility: selected\.visibility/);
  assert.match(src, /const requestOnly = selected\?\.visibility === "on_request"/);
  assert.equal((src.match(/requestOnly \? "request"/g) ?? []).length, 2);
});

test("D-10a: Maison shows the consult label, not the price, for on_request", () => {
  const src = read("src/app/t/[profileCode]/_maison/MaisonMenu.tsx");
  assert.match(src, /const onRequest = o\.visibility === "on_request"/);
  assert.match(src, /onRequest \|\| min === null \?[\s\S]{0,80}labels\.consult/);
});

test("D-10a: storefront cores withhold the amount for on_request", () => {
  assert.match(read("src/lib/storefront/service-collection.core.ts"), /o\.visibility === "on_request" \? null : fromCents|"on_request" \? null : fromCents/);
  assert.match(read("src/lib/storefront/appointment-picker.core.ts"), /o\.visibility === "on_request" \? null : o\.amountCents/);
  assert.match(read("src/lib/storefront/class-timetable.core.ts"), /visibility === "on_request" \? null : Number/);
});

test("D-10a: catalog grid and package selector only read public offerings (justified, unchanged)", () => {
  assert.match(read("src/lib/storefront/catalog-grid.core.ts"), /scopeToSellableOfferings\([\s\S]{0,200}"guest"/);
  assert.match(read("src/lib/storefront/package-selector.core.ts"), /scopeToSellableOfferings\([\s\S]{0,300}"guest"/);
});

test("D-10a: the menu board prints On request and no USD hint for on_request", () => {
  const src = read("src/lib/site-admin/builder-node/render.tsx");
  assert.match(src, /item\.visibility === "on_request"\) \{\s*return[\s\S]{0,160}Bajo consulta/);
  assert.match(src, /item\.visibility === "on_request" \? null : usdLine\(item\)/);
});

/**
 * TUL-690 follow-up: the hub `/w/<slug>/book` service card showed the title
 * only. It must show the same price + currency line as the services block,
 * from the shared helper, so the two never disagree.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { publicPriceLine } from "@/lib/talent/public-price-line";

const SRC = readFileSync(
  resolve(process.cwd(), "src/app/(public)/book/BookPageClient.tsx"),
  "utf8",
);

test("book page card renders the shared publicPriceLine", () => {
  assert.match(SRC, /from "@\/lib\/talent\/public-price-line"/);
  assert.match(SRC, /publicPriceLine\(\s*\{[^}]*amountCents:\s*selected\.amountCents/);
  assert.match(SRC, /data-book-page-price/);
});

test("the shared line carries the currency", () => {
  const line = publicPriceLine({ amountCents: 70000, currency: "MXN", priceDisplay: "exact" }, "es");
  assert.ok(line && line.includes("MXN"), `got ${line}`);
});

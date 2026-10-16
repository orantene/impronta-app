import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

test("TUL-976: /book shows each service's price and payment timing", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../app/(public)/book/BookPageClient.tsx"), "utf8");
  assert.match(src, /offeringPriceLabel\(selected, pageLocale\)/);
  assert.match(src, /offeringPriceLabel\(o, pageLocale\)/, "the service select names the price too");
  assert.match(src, /bookPagePaymentLine\(/);
  assert.match(src, /data-book-page-pay/);
});

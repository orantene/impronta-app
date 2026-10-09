import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { localizeTierName, localizeTierPrice } from "./pricing-ladders-copy";

// Bucket TUL-518 (was TUL-499): the Spanish pricing page printed the English
// catalog's "Free" plan name and price.
test("Spanish pricing localizes the catalog plan names and the Free price", () => {
  assert.equal(localizeTierName("Free", "es"), "Gratis");
  assert.equal(localizeTierName("Website", "es-MX"), "Sitio web");
  assert.equal(localizeTierName("Portfolio", "es"), "Portafolio");
  assert.equal(localizeTierName("Agency", "es"), "Agencia");
  assert.equal(localizeTierName("Studio", "es"), "Studio");
  assert.equal(localizeTierPrice("Free", "es"), "Gratis");
  assert.equal(localizeTierPrice("$29", "es"), "$29");
});

test("English is untouched and unknown names pass through", () => {
  assert.equal(localizeTierName("Free", "en"), "Free");
  assert.equal(localizeTierPrice("Free", "en"), "Free");
  assert.equal(localizeTierName("Enterprise", "es"), "Enterprise");
});

test("the ladders section renders names and prices through the localizers", () => {
  const src = readFileSync(join(process.cwd(), "src/components/marketing/pricing-ladders-section.tsx"), "utf8");
  assert.match(src, /name: localizeTierName\(t\.name, locale\)/);
  assert.match(src, /localizeTierPrice\(t\.price, locale\)/);
});

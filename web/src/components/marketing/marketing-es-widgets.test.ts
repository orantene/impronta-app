import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { currencyPickerCopy } from "./currency-picker-copy";
import { networkPreviewCopy } from "./network-preview-copy";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

test("the currency chip speaks Spanish on the Spanish site and keeps its English words otherwise", () => {
  const es = currencyPickerCopy("es");
  assert.equal(es.showing, "Mostrando precios en");
  assert.equal(es.source["ip-country"], "Detectada automáticamente");
  assert.equal(currencyPickerCopy("es-MX").pick, "Elige una moneda");
  const en = currencyPickerCopy("en");
  assert.equal(en.showing, "Showing prices in");
  assert.equal(en.source.cookie, "Your pick");
  assert.deepEqual(Object.keys(es.source).sort(), Object.keys(en.source).sort());
});

test("the footer and pricing page pass the request locale to the chip; options use localized names", () => {
  assert.match(read("src/components/marketing/footer.tsx"), /<CurrencyPicker current=\{currency\} source=\{source\} locale=\{locale\} \/>/);
  assert.match(read("src/app/(marketing)/pricing/page.tsx"), /<CurrencyPicker current=\{currency\} source=\{source\} locale=\{locale\} \/>/);
  const chip = read("src/components/marketing/currency-picker.tsx");
  assert.match(chip, /localizedCurrencyLabel\(code, locale\)/);
  assert.doesNotMatch(chip, /Showing prices in<\/span>/);
});

test("the network preview has the same cards and tags in both languages, all translated in Spanish", () => {
  const es = networkPreviewCopy("es");
  const en = networkPreviewCopy("en");
  assert.equal(es.cards.length, en.cards.length);
  assert.equal(es.tags.length, en.tags.length);
  assert.equal(es.eyebrow, "Agencias y hubs");
  assert.ok(es.tags.includes(es.openTag));
  for (let i = 0; i < es.cards.length; i++) {
    assert.equal(es.cards[i].name, en.cards[i].name); // brand names stay
    assert.notEqual(es.cards[i].meta, en.cards[i].meta);
  }
  assert.equal(es.cards[0].kindLabel, "Agencia");
  const view = read("src/components/marketing/network-section.tsx");
  assert.match(view, /networkPreviewCopy\(locale\)/);
  assert.doesNotMatch(view, /Search the network before you apply/);
});

test("the /pricing compare table has no hard-coded English chrome and names every category in Spanish", () => {
  const view = read("src/components/marketing/plan-feature-compare-table.tsx");
  assert.doesNotMatch(view, />\s*Feature\s*</);
  assert.doesNotMatch(view, />\s*Tier \{/);
  assert.doesNotMatch(view, /aria-label="(Not included|Included)"/);
  assert.match(view, /localizeTierName\(/);
  const types = read("src/lib/pricing/pricing-types.ts");
  const order = types.match(/COMPARE_CATEGORY_ORDER[^=]*=\s*\[([\s\S]*?)\]/)?.[1] ?? "";
  const esBlock = view.slice(view.indexOf("const COPY_ES"));
  for (const cat of order.match(/"([a-z_]+)"/g) ?? []) {
    assert.match(esBlock, new RegExp(`${cat.slice(1, -1)}:\\s*"`), `missing ES label for ${cat}`);
  }
});

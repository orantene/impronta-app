/**
 * parse-restauradmin.test.ts — against Parrilla El Paisa's REAL menu export,
 * not a fixture written to match the code.
 *
 * The acceptance test the CEO named is the tier-label join: a variant must be
 * labelled "1 come 2 pican", never "pican_2". Everything else here exists
 * because an importer's failures are quiet — a wrong price looks like a price,
 * a dropped product looks like a menu that never had it.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { parseRestauradminMenu } from "./parse-restauradmin";

const FIXTURE = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "src/lib/menu-import/parrilla-el-paisa.fixture.json"),
    "utf8",
  ),
);

const menu = parseRestauradminMenu(FIXTURE);

test("the real menu round-trips: 117 products, none dropped", () => {
  // 16, not the 13 in the brief: `cat-escabeches` nests three subcategories,
  // and 25 products reference a CHILD id. Walking only the top level loses 21%
  // of the menu. It surfaced only because an unknown category is refused BY
  // NAME rather than skipped — a dropping parser would have called 92 of 117 a
  // clean import.
  assert.equal(menu.counts.categories, 16);
  assert.equal(menu.counts.productsSeen, 117);
  assert.equal(
    menu.counts.imported + menu.counts.refused,
    117,
    "every product is either imported or refused BY NAME — none may vanish",
  );
  assert.equal(menu.counts.imported, 117, `refused: ${JSON.stringify(menu.refused)}`);
});

test("ACCEPTANCE: a tier is labelled from its CATEGORY, never by its key", () => {
  const picada = menu.items.find((i) => i.sourceId === "restauradmin:prod-picada-clasica");
  assert.ok(picada, "expected the Picada Clásica");
  assert.equal(picada.variants.length, 4);

  const labels = picada.variants.map((v) => v.label);
  assert.ok(
    labels.includes("1 come 2 pican"),
    `tier label came from the category; got ${JSON.stringify(labels)}`,
  );
  for (const v of picada.variants) {
    assert.notEqual(v.label, v.sourceKey, `variant fell back to its key: ${v.sourceKey}`);
    assert.equal(v.labelMissing, false);
  }
});

test("NO tier anywhere silently falls back to its key", () => {
  // The failure mode is invisible: "pican_2" on a menu reads as data.
  assert.equal(
    menu.counts.tierLabelsMissing,
    0,
    JSON.stringify(
      menu.items.flatMap((i) => i.variants.filter((v) => v.labelMissing).map((v) => `${i.sourceId}:${v.sourceKey}`)),
    ),
  );
});

test("prices are taken VERBATIM as minor units, not multiplied", () => {
  // A milanesa at 1000000 is 10,000.00 ARS (~$7). Multiplied it is ~$700.
  const mila = menu.items.find((i) => i.sourceId === "restauradmin:prod-sanguche-milanesa-sola");
  assert.ok(mila);
  assert.equal(mila.amountCents, 1000000);

  const picada = menu.items.find((i) => i.sourceId === "restauradmin:prod-picada-clasica");
  assert.deepEqual(
    picada?.variants.map((v) => v.amountCents).sort((a, b) => a - b),
    [3000000, 4000000, 5000000, 7000000],
  );
});

test("a single-tier product is a plain price, not a variant of one", () => {
  const mila = menu.items.find((i) => i.sourceId === "restauradmin:prod-sanguche-milanesa-sola");
  assert.equal(mila?.variants.length, 0, "one price is a price, not a one-option choice");
  assert.ok((mila?.amountCents ?? 0) > 0);
});

test("a multi-tier product has NO base price", () => {
  // Otherwise the board shows a price the customer cannot actually buy.
  const picada = menu.items.find((i) => i.sourceId === "restauradmin:prod-picada-clasica");
  assert.equal(picada?.amountCents, null);
  assert.equal(picada?.variants.length, 4);
});

test("only priceAction 'add' becomes an add-on", () => {
  const withMods = menu.items.filter((i) => i.addOns.length > 0);
  assert.equal(withMods.length, 2, "the export has exactly two");
  const fries = withMods
    .flatMap((i) => i.addOns)
    .find((a) => a.sourceId === "mod-con-papas-mila-sola");
  assert.ok(fries);
  assert.equal(fries.amountCents, 200000);
  assert.equal(fries.label.es, "Con fritas");
  assert.equal(fries.label.en, "With fries");
});

test("both languages survive, and the counts match the file", () => {
  assert.equal(menu.currency, "ARS");
  assert.equal(menu.defaultLocale, "es");
  // Measured against the file, correcting the brief: 21 images, and English on
  // ALL 117 rather than 110.
  assert.equal(menu.counts.withImage, 21);
  assert.equal(
    menu.items.filter((i) => i.title.en.trim()).length,
    117,
    "every product carries English; no translation step is needed",
  );
  const picada = menu.items.find((i) => i.sourceId === "restauradmin:prod-picada-clasica");
  assert.equal(picada?.title.es, "Picada Clásica");
  assert.equal(picada?.title.en, "Classic Board");
  assert.notEqual(picada?.title.es, picada?.title.en, "Spanish must not be English in the es slot");
});

test("the category name becomes the offering's category, not its id", () => {
  const picada = menu.items.find((i) => i.sourceId === "restauradmin:prod-picada-clasica");
  assert.equal(picada?.category, "PICADAS ARTESANALES");
  // A nested category keeps its parent, or "Animales" is meaningless on a board.
  const carpincho = menu.items.find((i) => i.sourceId === "restauradmin:prod-escabeche-carpincho");
  assert.equal(carpincho?.category, "ESCABECHES / Animales");
  assert.ok(!menu.items.some((i) => i.category.startsWith("cat-")), "no raw category ids leaked");
});

test("source ids are stable and unique — a re-import updates, never duplicates", () => {
  const ids = menu.items.map((i) => i.sourceId);
  assert.equal(new Set(ids).size, ids.length, "duplicate source id would mint a second menu");
  assert.ok(ids.every((id) => id.startsWith("restauradmin:")));
});

test("malformed input refuses by name instead of throwing or dropping", () => {
  const out = parseRestauradminMenu({
    config: { currency: { code: "MXN" }, defaultLanguage: "es" },
    catalog: {
      categories: [{ id: "c1", translations: { es: "Tacos", en: "Tacos" } }],
      products: [
        { id: "ok", categoryId: "c1", translations: { es: { name: "Taco" } }, prices: { default: 5000 } },
        { id: "nocat", categoryId: "ghost", translations: { es: { name: "Orphan" } }, prices: { default: 100 } },
        { id: "noprice", categoryId: "c1", translations: { es: { name: "Free?" } }, prices: {} },
        { id: "neg", categoryId: "c1", translations: { es: { name: "Negative" } }, prices: { default: -1 } },
        { id: "off", categoryId: "c1", enabled: false, translations: { es: { name: "Hidden" } }, prices: { default: 1 } },
      ],
    },
  });
  assert.equal(out.counts.imported, 1);
  assert.deepEqual(
    out.refused.map((r) => r.reason).sort(),
    ["disabled", "negative_price", "no_category", "no_price"],
  );
  for (const r of out.refused) assert.ok(r.detail.length > 0, "a refusal an operator cannot act on is not a refusal");
});

test("garbage in does not throw", () => {
  for (const junk of [null, undefined, {}, { catalog: null }, { catalog: { products: "nope" } }]) {
    const out = parseRestauradminMenu(junk);
    assert.equal(out.items.length, 0);
    assert.equal(out.currency, "USD", "an export with no currency must not invent one");
  }
});

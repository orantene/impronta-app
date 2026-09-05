/**
 * plan-import.test.ts — what the dry run promises, against the real menu.
 *
 * Three properties here are the difference between an importer and a data-loss
 * event: a re-import updates rather than duplicating, a hand-typed item is never
 * claimed, and a dish taken off the menu is never deleted.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { parseRestauradminMenu } from "./parse-restauradmin";
import { planMenuImport, planIsEmpty, type ExistingOffering } from "./plan-import";

const menu = parseRestauradminMenu(
  JSON.parse(
    readFileSync(
      path.join(process.cwd(), "src/lib/menu-import/parrilla-el-paisa.fixture.json"),
      "utf8",
    ),
  ),
);

/** What the writer would have produced on a first run. */
function asImported(): ExistingOffering[] {
  return menu.items.map((i, n) => ({
    id: `off-${n}`,
    title: i.title.es || i.title.en,
    amountCents: i.amountCents,
    currency: i.currency,
    category: i.category,
    attributes: { source_id: i.sourceId },
  }));
}

test("a first import creates all 117 and updates nothing", () => {
  const plan = planMenuImport(menu, []);
  assert.equal(plan.counts.create, 117);
  assert.equal(plan.counts.update, 0);
  assert.equal(plan.counts.orphans, 0);
  assert.equal(plan.currency, "ARS");
  assert.ok(plan.rows.every((r) => r.currency === "ARS"));
});

test("RE-IMPORT UPDATES, NEVER DUPLICATES", () => {
  // Without the source id a second run mints a second 117 and the board has two
  // of everything — which nobody notices until a customer does.
  const plan = planMenuImport(menu, asImported());
  assert.equal(plan.counts.create, 0, "a re-import must create nothing");
  assert.equal(plan.counts.unchanged, 117);
  assert.equal(plan.counts.update, 0);
  assert.ok(planIsEmpty(plan), "an unchanged re-import offers nothing to confirm");
});

test("a changed price shows as an update naming the field", () => {
  const rows = asImported();
  rows[0]!.amountCents = 999;
  rows[1]!.title = "Renamed by hand";
  const plan = planMenuImport(menu, rows);
  assert.equal(plan.counts.update, 2);
  const priced = plan.rows.find((r) => r.offeringId === "off-0");
  assert.deepEqual(priced?.changes, ["price"]);
  const retitled = plan.rows.find((r) => r.offeringId === "off-1");
  assert.deepEqual(retitled?.changes, ["title"]);
});

test("A HAND-TYPED ITEM IS NEVER CLAIMED, even with an identical title", () => {
  // Matching on title would let an import rename or overwrite the rows an
  // operator cared most about, silently.
  const handTyped: ExistingOffering = {
    id: "off-hand",
    title: menu.items[0]!.title.es,
    amountCents: 1,
    currency: "ARS",
    category: menu.items[0]!.category,
    attributes: null,
  };
  const plan = planMenuImport(menu, [handTyped]);
  assert.equal(plan.counts.create, 117, "the hand-typed row must not absorb an import");
  assert.equal(plan.counts.update, 0);
  assert.equal(plan.counts.orphans, 0, "a row with no source id is not an orphan either");
  assert.ok(!plan.rows.some((r) => r.offeringId === "off-hand"));
});

test("A DISH REMOVED FROM THE MENU IS REPORTED, NEVER DELETED", () => {
  const rows = asImported();
  rows.push({
    id: "off-gone",
    title: "Discontinued flan",
    amountCents: 500,
    currency: "ARS",
    category: "POSTRES",
    attributes: { source_id: "restauradmin:prod-flan-retired" },
  });
  const plan = planMenuImport(menu, rows);
  assert.equal(plan.counts.orphans, 1);
  assert.equal(plan.orphans[0]?.title, "Discontinued flan");
  // Nothing in the plan is a delete. An importer that removes on absence turns
  // a menu edit into data loss, and old orders still reference the row.
  assert.ok(!plan.rows.some((r) => (r.action as string) === "delete"));
});

test("the plan surfaces what a human needs to judge it", () => {
  const plan = planMenuImport(menu, []);
  // 15, not the parser's 16: the plan counts categories that actually HAVE
  // products, and `cat-escabeches` is a pure grouping header whose items all
  // live in its three children. An operator reading the dry run should see the
  // sections they will get, not the nodes in the file.
  assert.equal(plan.counts.categories, 15);
  assert.equal(plan.counts.withVariants, 24);
  assert.equal(plan.counts.withImage, 21);
  assert.equal(plan.counts.refused, 0);
  const picada = plan.rows.find((r) => r.sourceId === "restauradmin:prod-picada-clasica");
  assert.equal(picada?.variantCount, 4);
  assert.equal(picada?.amountCents, null, "a tier-only item shows no buyable base price");
});

test("refusals from the parse ride along, so one screen shows everything", () => {
  const partial = parseRestauradminMenu({
    config: { currency: { code: "MXN" }, defaultLanguage: "es" },
    catalog: {
      categories: [{ id: "c1", translations: { es: "Tacos", en: "Tacos" } }],
      products: [
        { id: "ok", categoryId: "c1", translations: { es: { name: "Taco" } }, prices: { default: 5000 } },
        { id: "bad", categoryId: "ghost", translations: { es: { name: "Orphan" } }, prices: { default: 1 } },
      ],
    },
  });
  const plan = planMenuImport(partial, []);
  assert.equal(plan.counts.create, 1);
  assert.equal(plan.counts.refused, 1);
  assert.equal(plan.refused[0]?.reason, "no_category");
});

test("an empty plan is empty, so a no-op cannot look like a run", () => {
  assert.ok(planIsEmpty(planMenuImport(parseRestauradminMenu(null), [])));
});

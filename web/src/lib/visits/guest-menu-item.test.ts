/**
 * TUL-1271 #4 / #5: the QR menu shows the full item (category, photo, words in
 * the guest's language, stock, in the owner's order) and the counter groups by
 * the owner's category with real Favorites. AMOUNTS ARE UNCHANGED.
 *
 * Run: node_modules/.bin/tsx --test src/lib/visits/guest-menu-item.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { sortGuestMenu, toGuestMenuItem, type GuestMenuRow } from "./guest-menu-item";
import { toCategoryTabs, toProductTiles, type PosCatalogItem } from "../../app/(workspace)/[tenantSlug]/admin/pos/counter-model";

function row(patch: Partial<GuestMenuRow> = {}): GuestMenuRow {
  return {
    id: "o1", title: "Latte", description: "Espresso and milk", amount_cents: 650, prep_station_id: null,
    category: "Coffee", category_i18n: { es: "Café" }, title_i18n: { en: "Latte", es: "Latte grande" },
    description_i18n: { es: "Espresso y leche" }, sort_order: 2, inventory_qty: null, capacity_pool_id: null, ...patch,
  };
}

test("toGuestMenuItem: words and category in the guest's language, price untouched", () => {
  const es = toGuestMenuItem(row(), "es", "https://x/y.jpg");
  assert.equal(es.title, "Latte grande");
  assert.equal(es.description, "Espresso y leche");
  assert.equal(es.category, "Café");
  assert.equal(es.amountCents, 650);
  assert.equal(es.imageUrl, "https://x/y.jpg");
  const en = toGuestMenuItem(row(), "en", null);
  assert.equal(en.category, "Coffee");
  assert.equal(en.imageUrl, null);
});

test("toGuestMenuItem: a counted pool at zero is sold out; unlimited and uncounted are not", () => {
  assert.equal(toGuestMenuItem(row({ capacity_pool_id: "p", inventory_qty: 0 }), "en", null).soldOut, true);
  assert.equal(toGuestMenuItem(row({ capacity_pool_id: "p", inventory_qty: 3 }), "en", null).soldOut, false);
  assert.equal(toGuestMenuItem(row({ capacity_pool_id: null, inventory_qty: 0 }), "en", null).soldOut, false);
});

test("sortGuestMenu: the owner's order, then title", () => {
  const items = [
    { ...toGuestMenuItem(row({ id: "b", title: "B", title_i18n: null, category: null, category_i18n: null, sort_order: 1 }), "en", null) },
    { ...toGuestMenuItem(row({ id: "a", title: "A", title_i18n: null, category: null, category_i18n: null, sort_order: 1 }), "en", null) },
    { ...toGuestMenuItem(row({ id: "c", title: "C", title_i18n: null, category: null, category_i18n: null, sort_order: 0 }), "en", null) },
  ];
  assert.deepEqual(sortGuestMenu(items).map((i) => i.id), ["c", "a", "b"]);
});

function cat(patch: Partial<PosCatalogItem> = {}): PosCatalogItem {
  return { id: "i", title: "Latte", amountCents: 650, kind: "product", sessions: [], ...patch };
}

test("counter: tiles group by the owner's category and carry the Favorites flag", () => {
  const tiles = toProductTiles([cat({ id: "a", category: "Coffee", favourite: true }), cat({ id: "b" })], "USD");
  assert.equal(tiles[0]!.categoryId, "cat:coffee");
  assert.equal(tiles[0]!.favourite, true);
  assert.equal(tiles[1]!.categoryId, "product");
  assert.equal(tiles[0]!.amountCents, 650);
});

test("counter: tabs list the owner's categories, then the kinds of uncategorised items", () => {
  const tabs = toCategoryTabs([cat({ category: "Coffee" }), cat({ category: "Coffee" }), cat({ category: "Food" }), cat()], { product: "Products" });
  assert.deepEqual(tabs, [
    { id: "cat:coffee", label: "Coffee" },
    { id: "cat:food", label: "Food" },
    { id: "product", label: "Products" },
  ]);
});

const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("wiring: the QR menu reads, localises and orders; the counter reads category and is_featured; Favorites unlock", () => {
  const order = src("./guest-order.ts");
  assert.match(order, /toGuestMenuItem\(/);
  assert.match(order, /sortGuestMenu\(/);
  assert.match(order, /loadCoverImages/);
  const counter = src("../../app/(workspace)/[tenantSlug]/admin/pos/counter-catalog.ts");
  assert.match(counter, /category/);
  assert.match(counter, /is_featured/);
  const sell = src("../../components/admin/pos/SellSurface.tsx");
  assert.match(sell, /products\.some\(\(p\) => p\.favourite\)/);
  const page = src("../../app/(public)/visit/[token]/menu/page.tsx");
  assert.match(page, /locale/);
});

// ── TUL-1338 ────────────────────────────────────────────────────────────

test("sortGuestMenu groups by category (case-insensitive), groups ordered by their first item, uncategorised last", () => {
  const mk = (id: string, category: string | null, sort: number) =>
    toGuestMenuItem(row({ id, title: id, title_i18n: null, category, category_i18n: null, sort_order: sort }), "en", null);
  const sorted = sortGuestMenu([mk("a", "Drinks", 0), mk("b", "Food", 1), mk("c", "drinks", 2), mk("d", null, 3), mk("e", "Food", 4)]);
  assert.deepEqual(sorted.map((i) => i.id), ["a", "c", "b", "e", "d"]);
});

test("a null amount stays null (Price on request); a real zero stays zero", () => {
  assert.equal(toGuestMenuItem(row({ amount_cents: null }), "en", null).amountCents, null);
  assert.equal(toGuestMenuItem(row({ amount_cents: 0 }), "en", null).amountCents, 0);
});

test("the image alt rides along", () => {
  assert.equal(toGuestMenuItem(row(), "en", "https://x/y.jpg", "A latte").imageAlt, "A latte");
  assert.equal(toGuestMenuItem(row(), "en", null).imageAlt, null);
});

test("counter tabs merge categories that differ only by case or spacing", () => {
  const tabs = toCategoryTabs([cat({ category: "Drinks" }), cat({ category: " drinks " }), cat({ category: "Food" })], {});
  assert.deepEqual(tabs, [
    { id: "cat:drinks", label: "Drinks" },
    { id: "cat:food", label: "Food" },
  ]);
  const tiles = toProductTiles([cat({ category: "DRINKS" })], "USD");
  assert.equal(tiles[0]!.categoryId, "cat:drinks");
});

test("TUL-1338 wiring", () => {
  const order = src("./guest-order.ts");
  assert.ok(order.indexOf('import "server-only"') < order.indexOf("guest-menu-item"), "imports go below server-only");
  assert.match(order, /\.eq\("owner_kind", "workspace"\)/, "the QR lists workspace menu items only");
  assert.ok(order.indexOf('.order("sort_order"') > -1 && order.indexOf('.order("sort_order"') < order.indexOf(".limit(200)"), "sort before limit");
  const page = src("../../app/(public)/visit/[token]/menu/page.tsx");
  assert.doesNotMatch(page, /items=\{menu\.items\}/, "the client gets a stripped item, not prepStationId/sortOrder");
  const avail = src("../../components/admin/shell/internal/page-modules/catalog/item-tab-availability.tsx");
  assert.doesNotMatch(avail, /\[item, patch\]/, "the station list is not refetched on every edit");
  const actions = src("../talent/menu-offerings-actions.ts");
  assert.match(actions, /prep_stations/, "the station is checked against this workspace on save");
});

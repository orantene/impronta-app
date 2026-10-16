/** TUL-1066 (c)(d): one row per added item, and Remove forgets it locally. */
import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

import type { GuestConversationItems } from "@/lib/inquiry/guest-chat-contract";

import { itemsWithoutAddedDuplicates } from "./guest-added-items-dedupe";
import { addAddedCatalogItem, removeAddedCatalogItem, resetAddedCatalogItems } from "./guest-added-items-store";

const line = (id: string, label: string, author: "client" | "staff" = "client") => ({ id, label, units: 1, unitCents: 0, author, confirmed: false, kind: null });
const items = (lines: ReturnType<typeof line>[]): GuestConversationItems => ({ currency: "USD", lines, records: [] });

beforeEach(() => resetAddedCatalogItems());

test("a thread line owned by a store entry (same line id) is hidden", () => {
  const out = itemsWithoutAddedDuplicates(items([line("l1", "Haircut"), line("l2", "Color")]), [{ id: "r1", title: "Haircut", priceLabel: null, lineId: "l1" }], []);
  assert.deepEqual(out?.lines.map((l) => l.id), ["l2"]);
});

test("an entry without a line id hides only a client line with the same label", () => {
  const out = itemsWithoutAddedDuplicates(items([line("l1", " haircut "), line("l2", "Haircut", "staff")]), [{ id: "r1", title: "Haircut", priceLabel: null }], []);
  assert.deepEqual(out?.lines.map((l) => l.id), ["l2"]);
});

test("a just-removed line stays hidden until the thread is re-read", () => {
  const out = itemsWithoutAddedDuplicates(items([line("l1", "Haircut")]), [], ["l1"]);
  assert.deepEqual(out?.lines, []);
});

test("nothing to dedupe returns the same object; null stays null", () => {
  const it = items([line("l1", "Haircut")]);
  assert.equal(itemsWithoutAddedDuplicates(it, [], []), it);
  assert.equal(itemsWithoutAddedDuplicates(null, [{ id: "r", title: "x", priceLabel: null }], []), null);
});

test("removeAddedCatalogItem drops the entry once; a repeat is a no-op", () => {
  addAddedCatalogItem({ id: "r1", title: "Haircut", priceLabel: null, lineId: "l1", token: "tok" });
  addAddedCatalogItem({ id: "r1", title: "Haircut", priceLabel: null, lineId: "l1", token: "tok" });
  removeAddedCatalogItem("r1");
  removeAddedCatalogItem("r1");
});

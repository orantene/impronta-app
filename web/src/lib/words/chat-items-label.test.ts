import assert from "node:assert/strict";
import { test } from "node:test";

import { chatItemsLabel } from "./chat-items-label";
import type { IndustryPresetId } from "./presets";
import { resolveWords } from "./resolve";

function lookup(presetId: IndustryPresetId, locale: "en" | "es", overrides: Record<string, Partial<Record<"en" | "es", string>>> = {}) {
  return resolveWords({ presetId, overrides, terminologyId: null }, locale);
}

test("derives the Items label from what the preset sells", () => {
  assert.equal(chatItemsLabel(lookup("agency", "en")), "Talent & services");
  assert.equal(chatItemsLabel(lookup("restaurant", "en")), "Your order");
  assert.equal(chatItemsLabel(lookup("restaurant", "es")), "Tu pedido");
  assert.equal(chatItemsLabel(lookup("salon_barber", "en")), "Services");
  assert.equal(chatItemsLabel(lookup("custom", "en")), "Items");
});

test("an operator's own word wins over the derived label", () => {
  const words = lookup("restaurant", "en", { "customers.chat_items": { en: "Your basket" } });
  assert.equal(chatItemsLabel(words), "Your basket");
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Translator } from "@/i18n/interpolate";
import { cartAnnounce } from "./cart-announce";

const root = join(__dirname, "../../../../..");
function translator(locale: "en" | "es"): Translator {
  const msgs = JSON.parse(readFileSync(join(root, `messages/${locale}.json`), "utf8"));
  return (key) => key.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], msgs) as string ?? key;
}

test("TUL-1927: es announce is fully Spanish and plural-aware", () => {
  const t = translator("es");
  assert.equal(cartAnnounce(t, "added", "Ana", 1), "Ana se agregó a tu solicitud. 1 talento seleccionado.");
  assert.equal(cartAnnounce(t, "added", "Ana", 3), "Ana se agregó a tu solicitud. 3 talentos seleccionados.");
  assert.equal(cartAnnounce(t, "removed", "Ana", 1), "Se quitó a Ana. 1 talento seleccionado.");
  assert.equal(cartAnnounce(t, "removed", "Ana", 2), "Se quitó a Ana. 2 talentos seleccionados.");
});

test("TUL-1927: the English placeholder name becomes the translated fallback", () => {
  assert.equal(cartAnnounce(translator("es"), "added", "Talent", 1), "Talento se agregó a tu solicitud. 1 talento seleccionado.");
  assert.equal(cartAnnounce(translator("es"), "added", "", 2), "Talento se agregó a tu solicitud. 2 talentos seleccionados.");
});

test("TUL-1927: en singular and plural", () => {
  const t = translator("en");
  assert.equal(cartAnnounce(t, "added", "Ana", 1), "Ana added to your inquiry. 1 talent selected.");
  assert.equal(cartAnnounce(t, "added", "Ana", 3), "Ana added to your inquiry. 3 talents selected.");
});

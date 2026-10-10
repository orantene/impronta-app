/**
 * TUL-529 — message catalogs must follow the language base of a BCP-47 tag so
 * guest-chat quick-reply chips stay in the same language as dock CTAs
 * (`startsWith("es")` → Consultar).
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { createTranslator, resolveMessageLocale } from "./messages";

const ASK_CHANGE = "public.guestChat.askQuickChange";

test("resolveMessageLocale maps regional + case tags onto catalog codes", () => {
  assert.equal(resolveMessageLocale("es"), "es");
  assert.equal(resolveMessageLocale("es-MX"), "es");
  assert.equal(resolveMessageLocale("ES"), "es");
  assert.equal(resolveMessageLocale("en-US"), "en");
  assert.equal(resolveMessageLocale("en"), "en");
  assert.equal(resolveMessageLocale("fr-CA"), "fr");
  assert.equal(resolveMessageLocale(null), "en");
  assert.equal(resolveMessageLocale(""), "en");
  assert.equal(resolveMessageLocale("pt-BR"), "en"); // no pt catalog yet
});

test("createTranslator: es-MX quick-reply chips are Spanish (not English fallback)", () => {
  const es = createTranslator("es")(ASK_CHANGE);
  const esMx = createTranslator("es-MX")(ASK_CHANGE);
  const en = createTranslator("en")(ASK_CHANGE);
  assert.equal(es, "¿Puedo cambiar el diseño?");
  assert.equal(esMx, es);
  assert.notEqual(esMx, en);
  assert.equal(createTranslator("en-US")(ASK_CHANGE), en);
  assert.equal(createTranslator("ES")(ASK_CHANGE), es);
});

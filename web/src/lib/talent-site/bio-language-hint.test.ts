import assert from "node:assert/strict";
import { test } from "node:test";

import { bioFallbackLanguage, bioLanguageHint } from "./bio-language-hint";

test("English visitor, only a Spanish bio: Disponible en español", () => {
  const bio = { es: "Soy artista de uñas." };
  assert.equal(bioFallbackLanguage(bio, "en", ["es"]), "es");
  assert.equal(bioLanguageHint(bio, "en", ["es"]), "Disponible en español");
});

test("Spanish visitor, only an English bio: Disponible en inglés", () => {
  const bio = { en: "I am a nail artist." };
  assert.equal(bioLanguageHint(bio, "es", ["en"]), "Disponible en inglés");
});

test("no hint when the visitor's language has a bio, or there is no bio", () => {
  assert.equal(bioLanguageHint({ en: "Hi", es: "Hola" }, "en", ["es"]), null);
  assert.equal(bioLanguageHint({}, "en", ["es"]), null);
  assert.equal(bioLanguageHint(null, "es"), null);
  assert.equal(bioLanguageHint({ es: "Hola" }, undefined), null);
});

test("hint names the language actually shown, walking the chain", () => {
  const bio = { fr: "Bonjour", en: "Hi" };
  assert.equal(bioFallbackLanguage(bio, "es", ["fr", "en"]), "fr");
  assert.equal(bioLanguageHint(bio, "es", ["fr", "en"]), "Disponible en francés");
});

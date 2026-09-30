import assert from "node:assert/strict";
import { test } from "node:test";

import { biosToI18nPatch, nextBioI18n } from "./bios-to-bio-i18n";

test("biosToI18nPatch keeps non-blank locales only", () => {
  assert.deepEqual(
    biosToI18nPatch([
      { locale: "en", text: "" },
      { locale: "es", text: " Hola " },
    ]),
    { es: "Hola" },
  );
  assert.deepEqual(biosToI18nPatch(null), {});
});

test("nextBioI18n merges and never wipes a locale the editor left blank", () => {
  const existing = { en: "Translation Center bio", es: "Viejo" };
  assert.deepEqual(
    nextBioI18n(existing, [
      { locale: "en", text: "" },
      { locale: "es", text: "Nuevo" },
    ]),
    { en: "Translation Center bio", es: "Nuevo" },
  );
});

test("nextBioI18n returns null when nothing changes (no write)", () => {
  assert.equal(nextBioI18n({ es: "Hola" }, [{ locale: "es", text: "Hola" }]), null);
  assert.equal(nextBioI18n({ es: "Hola" }, []), null);
});

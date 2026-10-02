import assert from "node:assert/strict";
import { test } from "node:test";

import { biosToI18nPatch, effectiveBioI18n, nextBioI18n, pickBio } from "./bios-to-bio-i18n";

// F25: every surface reads the bio the drawer saved.
test("effectiveBioI18n fills locales bio_i18n lacks from the saved bios; bio_i18n wins", () => {
  const saved = [{ locale: "en", text: "Hago uñas acrílicas en la Roma." }];
  assert.deepEqual(effectiveBioI18n({}, saved), { en: "Hago uñas acrílicas en la Roma." });
  assert.deepEqual(effectiveBioI18n({ en: "Kept" }, saved), { en: "Kept" });
  assert.deepEqual(effectiveBioI18n(null, [{ locale: "es", text: "Hola" }, null]), { es: "Hola" });
  assert.deepEqual(effectiveBioI18n({ es: "Hola" }, undefined), { es: "Hola" });
  assert.equal(pickBio({ es: "Hola" }, "en"), "Hola");
  assert.equal(pickBio({ en: "Hi", es: "Hola" }, "es"), "Hola");
  assert.equal(pickBio({}, "en"), "");
});

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

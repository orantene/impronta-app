import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { catalogLocaleKey, createTranslator } from "./messages";

describe("TUL-529 chat chips: createTranslator respects ES/es-MX", () => {
  it("catalogLocaleKey lowercases and strips region", () => {
    assert.equal(catalogLocaleKey("ES"), "es");
    assert.equal(catalogLocaleKey("es-MX"), "es");
    assert.equal(catalogLocaleKey("en-US"), "en");
    assert.equal(catalogLocaleKey(""), "en");
  });

  it("uppercase ES and es-MX resolve Spanish guestChat chips, not English", () => {
    for (const loc of ["ES", "es", "es-MX"]) {
      const t = createTranslator(loc);
      assert.equal(t("public.guestChat.askQuickChange"), "¿Puedo cambiar el diseño?");
      assert.doesNotMatch(t("public.guestChat.askQuickChange"), /Can I change/i);
    }
    const en = createTranslator("EN");
    assert.equal(en("public.guestChat.askQuickChange"), "Can I change the design?");
  });
});

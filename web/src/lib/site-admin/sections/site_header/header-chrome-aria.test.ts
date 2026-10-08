import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { siteHeaderChromeAria } from "./header-chrome-aria";

describe("siteHeaderChromeAria", () => {
  it("keeps English chrome labels on en", () => {
    assert.deepEqual(siteHeaderChromeAria("en"), {
      primaryNav: "Primary",
      saved: "Saved",
      inquiry: "Your inquiry",
      menu: "Menu",
    });
  });

  it("swaps to neutral Mexican Spanish on es", () => {
    assert.deepEqual(siteHeaderChromeAria("es"), {
      primaryNav: "Principal",
      saved: "Guardados",
      inquiry: "Tu solicitud",
      menu: "Menú",
    });
  });

  it("falls back to English when locale is missing", () => {
    assert.equal(siteHeaderChromeAria(null).primaryNav, "Primary");
    assert.equal(siteHeaderChromeAria(undefined).menu, "Menu");
  });
});

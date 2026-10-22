import assert from "node:assert/strict";
import test from "node:test";

import { unsupportedLocaleRedirectTarget } from "./unsupported-locale-redirect";

const base = { tenantDefaultLocale: "en", platformDefaultLocale: "en", search: new URLSearchParams() };

test("hub /es/t/<code> keeps Spanish via ?lang=es", () => {
  const r = unsupportedLocaleRedirectTarget({ ...base, requestedLocale: "es", remainderSegments: ["t", "TAL-93940"] });
  assert.equal(r.pathname, "/t/TAL-93940");
  assert.equal(r.search, "?lang=es");
});

test("an explicit ?lang is not overridden", () => {
  const r = unsupportedLocaleRedirectTarget({
    ...base, requestedLocale: "es", remainderSegments: ["t", "TAL-1"], search: new URLSearchParams("lang=en"),
  });
  assert.equal(r.search, "?lang=en");
});

test("other paths keep the old drop-the-prefix behavior", () => {
  const r = unsupportedLocaleRedirectTarget({ ...base, requestedLocale: "es", remainderSegments: ["pricing"] });
  assert.deepEqual(r, { pathname: "/pricing", search: "" });
});

test("TUL-1866: hub /es/directory keeps Spanish via ?lang=es", () => {
  const r = unsupportedLocaleRedirectTarget({ ...base, requestedLocale: "es", remainderSegments: ["directory"] });
  assert.deepEqual(r, { pathname: "/directory", search: "?lang=es" });
});

test("TUL-1866: only the directory root keeps ?lang, not its cart", () => {
  const r = unsupportedLocaleRedirectTarget({ ...base, requestedLocale: "es", remainderSegments: ["directory", "cart"] });
  assert.equal(r.search, "");
});

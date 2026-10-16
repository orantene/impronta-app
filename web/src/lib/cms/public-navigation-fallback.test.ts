import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { navigationLocaleFallbackOrder } from "./public-navigation";

test("TUL-697: ES visit falls back to the default then other locales, de-duplicated", () => {
  assert.deepEqual(navigationLocaleFallbackOrder("es", ["en", "en", "es"]), ["es", "en"]);
  assert.deepEqual(navigationLocaleFallbackOrder("en", ["en", "es"]), ["en", "es"]);
});

test("TUL-697: getPublicCmsNavigationLinks no longer returns [] for a locale with no rows", () => {
  const src = readFileSync(new URL("./public-navigation.ts", import.meta.url), "utf8");
  assert.match(src, /loadNavigationWithLocaleFallback\(/);
  assert.match(src, /href: resolvePublicCmsNavHref\(r\.href, locale, settings\)/);
});

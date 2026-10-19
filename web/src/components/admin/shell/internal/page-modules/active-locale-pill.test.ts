/**
 * TUL-1277: after switching Today to EN, the top bar ES/EN pill still lit ES
 * until the next navigation. The pill read the `locale` cookie (first match
 * wins, and a stale duplicate cookie or a seed hop can disagree with what the
 * server rendered) while the page copy reads the server-rendered locale. The
 * pill now lights the RENDERED locale; a click only lights the pick until the
 * reload lands.
 *
 *   cd web && npm run test:wt -- src/components/admin/shell/internal/page-modules/active-locale-pill.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { activeLocalePill } from "./active-locale-pill";

test("the rendered locale wins over a stale cookie", () => {
  assert.equal(activeLocalePill({ rendered: "en", picked: null, locales: ["es", "en"], fallback: "es" }), "en");
  assert.equal(activeLocalePill({ rendered: "es", picked: null, locales: ["es", "en"], fallback: "es" }), "es");
});

test("a click lights the pick until the reload lands", () => {
  assert.equal(activeLocalePill({ rendered: "es", picked: "en", locales: ["es", "en"], fallback: "es" }), "en");
});

test("a rendered locale outside the list falls back to the primary", () => {
  assert.equal(activeLocalePill({ rendered: "fr", picked: null, locales: ["es", "en"], fallback: "es" }), "es");
  assert.equal(activeLocalePill({ rendered: "", picked: null, locales: ["es", "en"], fallback: "en" }), "en");
});

test("LanguageMenu lights the rendered locale, not a cookie read", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/admin/shell/internal/page-modules/LanguageMenu.tsx"),
    "utf8",
  );
  assert.match(src, /activeLocalePill\(\{ rendered: renderedLocale/);
  assert.doesNotMatch(src, /setActive\(readLocaleFromDocumentCookie/);
});

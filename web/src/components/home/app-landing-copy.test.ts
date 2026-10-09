import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { appLandingCopy } from "./app-landing-copy";

// Bucket TUL-518 (was TUL-499): app.tulala.digital signed-out landing was all
// English with no language switch.
test("the app-host landing has Spanish for every string and keeps the brand name", () => {
  const es = appLandingCopy("es", "Tulala");
  const en = appLandingCopy("en", "Tulala");
  assert.equal(es.signIn, "Iniciar sesión");
  assert.equal(es.createAccount, "Crear una cuenta");
  assert.match(es.welcome, /Tulala/);
  assert.equal(en.welcome, "Welcome to Tulala");
  const flat = (o: Record<string, unknown>): string[] => Object.values(o).flatMap((v) => (typeof v === "object" && v ? flat(v as Record<string, unknown>) : [String(v)]));
  const e = flat(en);
  const s = flat(es);
  assert.equal(e.length, s.length);
  for (let i = 0; i < e.length; i++) {
    if (["Tulala"].includes(e[i])) continue;
    assert.notEqual(s[i], e[i], `untranslated: ${e[i]}`);
  }
});

test("the landing renders its words from the copy module and offers the EN|ES switch", () => {
  const view = readFileSync(join(process.cwd(), "src/components/home/app-landing.tsx"), "utf8");
  assert.match(view, /appLandingCopy\(locale, PLATFORM_BRAND\.name\)/);
  assert.match(view, /<AuthCardLocaleToggle locale=\{locale\}/);
  for (const english of ["Welcome to", "Create an account", "Looking for the public site", "← Back to"]) {
    assert.ok(!view.includes(english), `hard-coded English left: ${english}`);
  }
  const page = readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8");
  assert.match(page, /<AppLanding locale=\{await appLandingLocale\(\)\} \/>/);
});

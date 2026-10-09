/**
 * TUL-488: talent_site hosts must pass platform locales into the locale
 * decision and 404 unsupported prefixes in that language (never as page slugs).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = readFileSync(join(process.cwd(), "src/lib/saas/talent-site-host-response.ts"), "utf8");

test("talent site host response wires platformLocales into decideTalentSiteLocale", () => {
  assert.match(SRC, /platformLocales:\s*talentLangSettings\.publicLocales/);
  assert.match(SRC, /unsupportedPrefix/);
  assert.match(SRC, /\/_page-not-found/);
});

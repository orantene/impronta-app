/**
 * TUL-516 S3: DocumentLang must sync `<html lang>` before paint, not only in
 * useLayoutEffect (which left lang="es" while the English UI painted).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(join(process.cwd(), "src/components/i18n/DocumentLang.tsx"), "utf8");

test("DocumentLang bootstraps documentElement.lang from the body locale", () => {
  assert.match(SRC, /documentLangBootstrapScript/);
  assert.match(SRC, /dangerouslySetInnerHTML/);
  assert.match(SRC, /useLayoutEffect/);
});

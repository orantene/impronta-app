/**
 * Platform Spanish is Mexican tú. These voseo forms must not return in
 * es.json or the industry presets. A talent's own site pages are not in
 * this check.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const VOSEO = /Reservá|Podés|Elegí|pagás|consultá|querés|tenés/;

test("es.json and the industry presets do not use voseo", () => {
  for (const rel of ["messages/es.json", "src/lib/words/presets.ts"]) {
    const text = readFileSync(join(ROOT, rel), "utf8");
    assert.equal(VOSEO.test(text), false, rel);
  }
});

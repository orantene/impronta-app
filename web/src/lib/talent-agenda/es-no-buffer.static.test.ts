import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// TUL-686: Spanish copy says "margen", never the English word "buffer".
const FILES = [
  "src/lib/talent-agenda/agenda-i18n.ts",
  "src/components/admin/shell/internal/dashboard-i18n.ts",
];

test("Spanish values never contain the word buffer", () => {
  for (const file of FILES) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      // Entry shape: "English key": "Spanish value", or a value-only continuation line.
      const m = line.match(/^\s*"((?:[^"\\]|\\.)*)":\s*"((?:[^"\\]|\\.)*)",?\s*$/) ?? line.match(/^\s{4,}"((?:[^"\\]|\\.)*)",?\s*$/);
      if (!m) return;
      const value = m[2] ?? m[1];
      const keyOnlyContinuation = m[2] === undefined;
      if (keyOnlyContinuation && !/[áéíóúñ¿¡]| (de|el|la|y|tu) /.test(value)) return;
      assert.ok(!/\bbuffers?\b/i.test(value), `${file}:${i + 1} has "buffer" in a Spanish value: ${value}`);
    });
  }
});

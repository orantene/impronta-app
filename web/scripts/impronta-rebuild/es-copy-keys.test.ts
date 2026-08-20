import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A duplicate key in a Spanish copy map is the quietest bug in this repo.
 *
 * The maps are keyed by the exact English string, so the same sentence used in
 * two places is ONE key. Add it twice with two translations and JavaScript
 * keeps the last one — the other place silently renders the wrong Spanish. It
 * happened three times in one night: a step title collided with a CTA label
 * ("Browse the roster" rendered as "Explorar el directorio"), two different men
 * in near-identical poses got word-for-word identical alt text, and a hero CTA
 * collided with a section CTA.
 *
 * tsc DOES catch this, as TS1117. This test exists anyway because it catches it
 * in a second instead of three minutes, and because it names the colliding key
 * and the line numbers instead of pointing at the closing brace of a 300-line
 * object literal.
 *
 * It reads the SOURCE, not the imported module: by the time the module is
 * imported the duplicate has already collapsed and the evidence is gone.
 */

const DIR = join(dirname(fileURLToPath(import.meta.url)), "pages");

function duplicateKeys(source: string): Array<{ key: string; lines: number[] }> {
  const seen = new Map<string, number[]>();
  source.split("\n").forEach((line, i) => {
    // Top-level entries only: two spaces of indent, then a quoted key or a
    // bare identifier key, then a colon. Nested objects are indented further.
    const m = /^ {2}(?:"((?:[^"\\]|\\.)*)"|([A-Za-z_$][\w$]*))\s*:/.exec(line);
    if (!m) return;
    const key = m[1] ?? m[2]!;
    seen.set(key, [...(seen.get(key) ?? []), i + 1]);
  });
  return [...seen.entries()]
    .filter(([, lines]) => lines.length > 1)
    .map(([key, lines]) => ({ key, lines }));
}

test("no Spanish copy map has a duplicate key", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith("-es-copy.ts"));
  assert.ok(files.length >= 4, "expected the es-copy maps to be found");
  const problems: string[] = [];
  for (const file of files) {
    for (const { key, lines } of duplicateKeys(readFileSync(join(DIR, file), "utf8"))) {
      problems.push(`${file}: "${key}" appears on lines ${lines.join(", ")}`);
    }
  }
  assert.deepEqual(
    problems,
    [],
    `a duplicate key means one of the two places renders the WRONG Spanish:\n${problems.join("\n")}`,
  );
});

test("the detector actually detects", () => {
  const sample = [
    "export const X: Record<string, string> = {",
    '  "Book a session": "Reserva una sesión",',
    "  Casting: \"Casting\",",
    '  "Book a session": "Reservar sesión",',
    "  nested: { \"Book a session\": \"ignored, wrong depth\" },",
    "};",
  ].join("\n");
  assert.deepEqual(duplicateKeys(sample), [{ key: "Book a session", lines: [2, 4] }]);
});

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { ES_TEXT } from "./editor-i18n-es";
import { MESSAGES } from "./editor-i18n";

/**
 * WAVE 0a — Spanish parity guard for the editor chrome.
 *
 * Spanish is a product requirement, not a follow-up. The failure mode this
 * exists to stop is the one the 2026-08-04 audit found: `editorT` falls back to
 * the English input when a key is missing, so an untranslated string renders
 * perfectly in English and nothing anywhere reports a gap. Coverage silently
 * decayed to a Spanish frame wrapped around an English product.
 *
 * The contract: every string a developer wrapped in `t("...")` has an ES entry.
 * Wrapping a string is the explicit claim "this is user-facing copy", so it is
 * a fair place to require the translation, and it lands in the same commit as
 * the string (program rule 9).
 *
 * WHAT THIS CANNOT SEE, stated plainly rather than implied away:
 *   - `t(someVariable)` and `t(`template ${x}`)` are not statically analysable.
 *     They are counted and reported, never silently ignored.
 *   - It does not prove a string SHOULD have been wrapped. An unwrapped literal
 *     is invisible here; that is wave 4's job, measured by a live walkthrough.
 *   - It does not check translation QUALITY, only presence.
 *
 * Scope is the editor chrome catalog only. The dashboard has a SEPARATE i18n
 * system (`dashboard-i18n.ts`); conflating them would make this guard both too
 * strict and too loose.
 */

const EDIT_CHROME = join(process.cwd(), "src/components/edit-chrome");

/**
 * Strings that render identically in both languages: proper nouns, brand names,
 * units, and single glyphs. Each needs a reason, so the list stays a decision
 * rather than a dumping ground.
 */
const INTENTIONALLY_UNTRANSLATED: ReadonlyMap<string, string> = new Map([
  ["Tulala", "brand name"],
  ["AI", "used as a proper noun in both locales"],
  ["px", "unit"],
  ["%", "unit"],
  ["CSS", "technical acronym, identical in Spanish"],
  ["HTML", "technical acronym, identical in Spanish"],
  ["SEO", "acronym, identical in Spanish"],
  ["URL", "acronym, identical in Spanish"],
  ["100%", "numeric literal"],
  ["—", "no-value glyph"],
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    if (/^editor-i18n/.test(entry)) continue; // the catalogs themselves
    out.push(full);
  }
  return out;
}

/**
 * Extract `t("literal")` / `t('literal')` call sites. Deliberately conservative:
 * it matches a single-line literal argument and nothing else, so anything it is
 * unsure about lands in the dynamic bucket and gets reported rather than passed.
 */
const STATIC_CALL = /\bt\(\s*(["'])((?:\\.|(?!\1)[^\\])*?)\1\s*[,)]/g;
const DYNAMIC_CALL = /\bt\(\s*(?!["'])/g;

/**
 * Decode a source literal into the string the code actually passes at runtime.
 *
 * Unescaping only quotes is not enough: `t("Structure (⌘\\)")` passes
 * `Structure (⌘\)`, and comparing the raw source form against the catalog
 * reports a phantom gap that no amount of translating can close. Found by this
 * guard failing on its own first run.
 */
function decodeLiteral(raw: string): string {
  return raw.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_m, esc: string) => {
    switch (esc[0]) {
      case "n": return "\n";
      case "t": return "\t";
      case "r": return "\r";
      case "b": return "\b";
      case "f": return "\f";
      case "v": return "\v";
      case "0": return "\0";
      case "u": return String.fromCodePoint(parseInt(esc.slice(1), 16));
      case "x": return String.fromCodePoint(parseInt(esc.slice(1), 16));
      default: return esc; // \\ \" \' and any other escaped char
    }
  });
}

interface Extraction {
  staticKeys: Map<string, string[]>; // key -> files
  dynamicCount: number;
  dynamicFiles: Set<string>;
}

function extract(): Extraction {
  const staticKeys = new Map<string, string[]>();
  let dynamicCount = 0;
  const dynamicFiles = new Set<string>();

  for (const file of walk(EDIT_CHROME)) {
    const src = readFileSync(file, "utf8");
    const rel = file.slice(file.indexOf("src/"));

    for (const m of src.matchAll(STATIC_CALL)) {
      const key = decodeLiteral(m[2]!);
      if (!key.trim()) continue;
      const files = staticKeys.get(key) ?? [];
      files.push(rel);
      staticKeys.set(key, files);
    }
    const dyn = [...src.matchAll(DYNAMIC_CALL)].length;
    if (dyn > 0) {
      dynamicCount += dyn;
      dynamicFiles.add(rel);
    }
  }
  return { staticKeys, dynamicCount, dynamicFiles };
}

/** A key is covered by the text catalog or by the legacy semantic-key table. */
function isCovered(key: string): boolean {
  if (Object.prototype.hasOwnProperty.call(ES_TEXT, key)) return true;
  if (Object.prototype.hasOwnProperty.call(MESSAGES.es, key)) return true;
  if (INTENTIONALLY_UNTRANSLATED.has(key)) return true;
  return false;
}

test("every t()-wrapped editor string has a Spanish entry", () => {
  const { staticKeys } = extract();
  const missing: Array<{ key: string; file: string }> = [];

  for (const [key, files] of staticKeys) {
    if (!isCovered(key)) missing.push({ key, file: files[0]! });
  }

  // Sorted so the failure output is stable and reviewable, and capped so a
  // large regression prints a usable list instead of thousands of lines.
  missing.sort((a, b) => a.key.localeCompare(b.key));
  const shown = missing
    .slice(0, 40)
    .map((m) => `  ${m.file}\n    t("${m.key}")`)
    .join("\n");

  assert.equal(
    missing.length,
    0,
    missing.length === 0
      ? ""
      : `${missing.length} t()-wrapped string(s) have no Spanish entry.\n\n` +
          `Spanish is a requirement: add each to ES_TEXT in ` +
          `editor-i18n-es.ts in the SAME commit as the string. If a string is ` +
          `genuinely identical in both languages, add it to ` +
          `INTENTIONALLY_UNTRANSLATED in this file WITH a reason.\n\n${shown}` +
          (missing.length > 40 ? `\n  ...and ${missing.length - 40} more` : ""),
  );
});

test("the guard reports what it cannot statically see", () => {
  const { staticKeys, dynamicCount, dynamicFiles } = extract();

  // Not a failure: dynamic t() calls are legitimate (locale-resolved labels,
  // interpolated counts). This test exists so the number is VISIBLE, because a
  // guard that quietly ignores a category teaches false confidence.
  console.log(
    `[es-parity] ${staticKeys.size} static t() keys checked; ` +
      `${dynamicCount} dynamic t() call(s) across ${dynamicFiles.size} file(s) ` +
      `cannot be statically verified.`,
  );

  assert.ok(staticKeys.size > 0, "extraction found no t() call sites at all, which means the matcher broke rather than the code being clean");
});

test("the allow-list stays a decision, not a dumping ground", () => {
  for (const [key, reason] of INTENTIONALLY_UNTRANSLATED) {
    assert.ok(
      reason.trim().length > 0,
      `INTENTIONALLY_UNTRANSLATED entry "${key}" needs a reason`,
    );
  }
  assert.ok(
    INTENTIONALLY_UNTRANSLATED.size < 40,
    "the untranslated allow-list is growing into a way to avoid translating; review it",
  );
});

test("the ES catalog has no duplicate keys", () => {
  // TypeScript already rejects duplicate keys (TS1117), but only on a FULL
  // tsc run, and the catalog is EN-text-keyed and append-heavy so concurrent
  // sessions collide in it constantly: three separate collisions in one day,
  // two of which reached main. Catching it in the fast builder lane means the
  // feedback arrives in seconds instead of after a red main.
  const files = [
    "src/components/edit-chrome/editor-i18n-es.ts",
    "src/components/edit-chrome/editor-i18n-es-canvas.ts",
    "src/components/edit-chrome/editor-i18n-es-sections.ts",
  ];
  const problems: string[] = [];

  for (const rel of files) {
    const src = readFileSync(join(process.cwd(), rel), "utf8");
    const seen = new Map<string, number>();
    src.split("\n").forEach((line, i) => {
      // Top-level entries only: exactly two spaces of indent, then a key.
      const m = /^ {2}(?:(["'])((?:\\.|(?!\1)[^\\])*?)\1|([A-Za-z_$][\w$]*))\s*:/.exec(line);
      if (!m) return;
      const key = m[2] !== undefined ? decodeLiteral(m[2]) : m[3]!;
      const first = seen.get(key);
      if (first !== undefined) {
        problems.push(`  ${rel}: "${key}" defined at line ${first} and again at ${i + 1}`);
      } else {
        seen.set(key, i + 1);
      }
    });
  }

  assert.equal(
    problems.length,
    0,
    problems.length === 0
      ? ""
      : `${problems.length} duplicate key(s) in the ES catalog. The later one ` +
          `silently wins at runtime and TS1117 fails the build.\n\n${problems.join("\n")}`,
  );
});

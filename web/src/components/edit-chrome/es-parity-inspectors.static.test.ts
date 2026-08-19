import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { ES_TEXT } from "./editor-i18n-es";

/**
 * WAVE 4.4 — Spanish parity guard for the DEEP INSPECTORS.
 *
 * The wave-0 guard (`es-parity.static.test.ts`) can only see `t("literal")`
 * call sites. The deep inspectors have none: style, layout, motion, data,
 * site-header and the per-block content panels hand their copy to the
 * inspector kit as `label` / `title` / `hint` / `help` / `description` /
 * `placeholder` props, and the kit resolves them at one boundary
 * (`inspectors/kit/use-inspector-t.ts`). Same resolver, same `ES_TEXT` map,
 * different place. Without this guard those ~660 strings would be invisible to
 * CI and would decay back to English exactly the way the 2026-08-04 audit
 * found the first time.
 *
 * So this is the boundary-prop analogue of the wave-0 guard: harvest the prop
 * literals out of `inspectors/**`, require a Spanish entry for each.
 *
 * WHAT THIS CANNOT SEE, stated plainly:
 *   - A prop whose value is an expression (`label={someVar}`) is not
 *     statically analysable. Counted and reported, never silently ignored.
 *   - It does not prove the string reaches a translating primitive. A panel
 *     that hand-rolls its own `<span>` bypasses the boundary; that is caught
 *     by the live Spanish walkthrough, not here.
 *   - It does not check translation QUALITY, only presence.
 */

const INSPECTORS = join(
  process.cwd(),
  "src/components/edit-chrome/inspectors",
);

/**
 * Props the inspector kit primitives translate at the boundary. Keep this in
 * sync with `use-inspector-t.ts` consumers: a prop added there without being
 * added here is coverage the guard silently stops enforcing.
 */
const BOUNDARY_PROP =
  /\b(label|title|hint|help|placeholder|description|info|desktopOnlyMessage|placeholderValue|replaceLabel|meta)\s*[=:]\s*(?:\{\s*)?(["'])((?:\\.|(?!\2)[^\\])*?)\2/g;

/** A boundary prop whose value is an expression rather than a literal. */
const DYNAMIC_PROP =
  /\b(label|title|hint|help|placeholder|description)\s*=\s*\{(?!\s*["'])/g;

/**
 * CSS and code VALUE SAMPLES. These render inside a control as an example of
 * the syntax the field accepts (`0 -4px`, `auto 1fr`, `cover · contain`), or
 * are typographic specimens (`Aa`). They are code, not prose: translating them
 * would make the example wrong. Separate from the proper-noun list below so
 * neither turns into a place to dump real copy.
 */
const CODE_VALUE_SAMPLES: ReadonlySet<string> = new Set([
  // Placeholder EXAMPLES of operator content, not UI chrome: the field shows
  // what a good answer looks like, and a Spanish operator types their own.
  "Book talent",
  "New",
  // A CSS token, shown as a placeholder so the operator knows a theme token is
  // accepted where a colour is expected. Translating it would break the value.
  "var(--token-color-accent)",
  ".2s",
  "0s",
  "0.6s",
  "3s",
  "6s",
  "9s",
  "12s",
  "12px",
  "24px",
  "0 -4px",
  "10px -8px",
  "2px · -1px",
  "2px solid #6366f1",
  "0 12px 32px rgba(0,0,0,.18)",
  "0 2px 8px rgba(0,0,0,.4)",
  "0 8px 24px rgba(0,0,0,0.12)",
  "auto 1fr",
  "span 2",
  "cover · contain · 100% auto",
  "center · top · 50% 20%",
  "center · top left · 50% 20%",
  "2fr 1fr · repeat(auto-fit,minmax(200px,1fr))",
  "x mandatory · y proximity",
  "none / s / m / l",
  "container name",
  "Aa",
  "AA",
  "Sat.",
  "Reg",
  "Med",
]);

/**
 * Strings that render identically in both languages. Each needs a reason, so
 * the list stays a decision rather than a way to avoid translating.
 */
const INTENTIONALLY_UNTRANSLATED: ReadonlyMap<string, string> = new Map([
  ["HTML", "technical acronym, identical in Spanish"],
  ["CSS", "technical acronym, identical in Spanish"],
  ["URL", "acronym, identical in Spanish"],
  ["Facebook", "product name"],
  ["Instagram", "product name"],
  ["LinkedIn", "product name"],
  ["TikTok", "product name"],
  ["YouTube", "product name"],
  ["WhatsApp", "product name"],
  ["X (Twitter)", "product name"],
  ["Aurora", "preset name, identical in Spanish"],
  ["Noir", "preset name, a French loanword used in both languages"],
  ["Ken Burns zoom", "named after the film-maker; the effect keeps his name"],
  ["Zoom", "loanword, identical in Spanish"],
  ["Feed", "loanword, identical in Spanish"],
  // Placeholder SAMPLES in the site-footer inspector. A placeholder here is
  // demonstrating the SHAPE of the value (a studio name, a copyright line), and
  // the sample studio name is a proper noun that reads identically in Spanish.
  // Translating it would only invent a second fictional agency.
  ["Nova Crew", "sample studio name used as a placeholder; a proper noun"],
  ["© Nova Crew", "sample copyright line built from the sample studio name; the glyph and the name are identical in Spanish"],
]);

/** Regex-shaped exemptions: pure symbols, hex colors, bare URLs and paths. */
const CODE_SHAPED: ReadonlyArray<RegExp> = [
  /^[^A-Za-z]*$/,
  /^#[0-9a-fA-F]{3,8}$/,
  /^https?:/,
  /^\//,
  /^(url|rgba?|hsla?|blur|linear-gradient|radial-gradient|cubic-bezier|circle|polygon|repeat|minmax)\(/,
  /^(div|span|section|article|aside|header|footer|nav|main|form)$/,
  /^(px|em|rem|vh|vw|deg|fr|s|ms)$/,
  /^text-\[/,
  /^[a-z-]+(\s*[,·/]\s*[a-z0-9-]+)*$/,
  /^(H[1-6]|XL|L|M|S|A|B|X|Y)$/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

interface Extraction {
  literals: Map<string, string[]>;
  dynamicCount: number;
  dynamicFiles: Set<string>;
}

function extract(): Extraction {
  const literals = new Map<string, string[]>();
  let dynamicCount = 0;
  const dynamicFiles = new Set<string>();

  for (const file of walk(INSPECTORS)) {
    const src = readFileSync(file, "utf8");
    const rel = file.slice(file.indexOf("src/"));

    for (const m of src.matchAll(BOUNDARY_PROP)) {
      const value = m[3]!;
      if (!value.trim()) continue;
      const files = literals.get(value) ?? [];
      files.push(rel);
      literals.set(value, files);
    }
    const dyn = [...src.matchAll(DYNAMIC_PROP)].length;
    if (dyn > 0) {
      dynamicCount += dyn;
      dynamicFiles.add(rel);
    }
  }
  return { literals, dynamicCount, dynamicFiles };
}

function isCovered(value: string): boolean {
  if (Object.prototype.hasOwnProperty.call(ES_TEXT, value)) return true;
  if (INTENTIONALLY_UNTRANSLATED.has(value)) return true;
  if (CODE_VALUE_SAMPLES.has(value)) return true;
  return CODE_SHAPED.some((re) => re.test(value));
}

test("every deep-inspector boundary string has a Spanish entry", () => {
  const { literals } = extract();
  const missing: Array<{ value: string; file: string }> = [];

  for (const [value, files] of literals) {
    if (!isCovered(value)) missing.push({ value, file: files[0]! });
  }

  missing.sort((a, b) => a.value.localeCompare(b.value));
  const shown = missing
    .slice(0, 40)
    .map((m) => `  ${m.file}\n    "${m.value}"`)
    .join("\n");

  assert.equal(
    missing.length,
    0,
    missing.length === 0
      ? ""
      : `${missing.length} inspector string(s) reach the operator with no ` +
          `Spanish entry.\n\nAdd each to ES_INSPECTOR_TEXT in ` +
          `editor-i18n-es-inspectors.ts in the SAME commit as the string. If ` +
          `it is a code/CSS value sample or a proper noun, add it to ` +
          `CODE_VALUE_SAMPLES or INTENTIONALLY_UNTRANSLATED in this file ` +
          `WITH a reason.\n\n${shown}` +
          (missing.length > 40 ? `\n  ...and ${missing.length - 40} more` : ""),
  );
});

test("the inspector guard reports what it cannot statically see", () => {
  const { literals, dynamicCount, dynamicFiles } = extract();

  // Not a failure: expression-valued props are legitimate (interpolated
  // counts, values already resolved by the panel). This test exists so the
  // number is VISIBLE, because a guard that quietly ignores a category
  // teaches false confidence.
  console.log(
    `[es-parity-inspectors] ${literals.size} boundary literals checked; ` +
      `${dynamicCount} expression-valued prop(s) across ${dynamicFiles.size} ` +
      `file(s) cannot be statically verified.`,
  );

  assert.ok(
    literals.size > 100,
    "extraction found almost no boundary props, which means the matcher broke rather than the panels being clean",
  );
});

test("the inspector allow-lists stay a decision, not a dumping ground", () => {
  for (const [value, reason] of INTENTIONALLY_UNTRANSLATED) {
    assert.ok(
      reason.trim().length > 0,
      `INTENTIONALLY_UNTRANSLATED entry "${value}" needs a reason`,
    );
  }
  assert.ok(
    INTENTIONALLY_UNTRANSLATED.size < 30,
    "the untranslated allow-list is growing into a way to avoid translating; review it",
  );
  assert.ok(
    CODE_VALUE_SAMPLES.size < 60,
    "the code-sample allow-list is growing into a way to avoid translating; review it",
  );
});

test("no Spanish inspector string uses an em dash", () => {
  // House copy rule: em dashes are banned in user-facing copy, ES included.
  const src = readFileSync(
    join(process.cwd(), "src/components/edit-chrome/editor-i18n-es-inspectors.ts"),
    "utf8",
  );
  const offenders = src
    .split("\n")
    .map((line, i) => ({ line, i: i + 1 }))
    .filter(({ line }) => !line.trimStart().startsWith("*"))
    .filter(({ line }) => !line.trimStart().startsWith("//"))
    .filter(({ line }) => line.includes("—"));

  assert.equal(
    offenders.length,
    0,
    offenders.length === 0
      ? ""
      : `em dash in Spanish inspector copy:\n${offenders
          .map((o) => `  line ${o.i}: ${o.line.trim()}`)
          .join("\n")}`,
  );
});

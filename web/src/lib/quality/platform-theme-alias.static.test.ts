/**
 * J6 — `.site-theme-platform` is an ALIAS SHEET onto the marketing `--tl-*`
 * tokens, and stays one.
 *
 * WHY
 * ───
 * A new client used to cross three papers and three greens in three minutes:
 * `#faf6ee`/`#1e3a2d` on tulala.digital, `#fffdf7`/`#1f4a3a` on signup, then
 * the workspace's own. The middle one was a fourth palette in no design doc,
 * painted by this class. Signing up is the marketing site's last screen, so it
 * wears the marketing brand (Creative Direction J6, CEO-approved with a
 * mapping table, 2026-09-05).
 *
 * WHAT THIS PINS
 * ──────────────
 *  1. Every declaration in the block reads a `--tl-*` token (radius excepted).
 *  2. The `--impronta-*` rows are gone from the block and nothing under the
 *     wrappers that carry the class reads an `--impronta-*` name, so deleting
 *     them cannot have orphaned a consumer.
 *  3. Every element that carries the class also carries
 *     `data-platform-surface="marketing"`, which is what brings `--tl-*` into
 *     scope. (The literal fallbacks in the block are a belt; this is the braces.)
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "./supabase-unchecked-read";

const css = readFileSync(join(WEB_ROOT, "src/app/globals.css"), "utf8");
const blockStart = css.indexOf(".site-theme-platform {");
assert.ok(blockStart > -1, "the .site-theme-platform block is gone from globals.css");
const block = css.slice(blockStart, css.indexOf("\n  }\n", blockStart));
const declarations = block
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.startsWith("--"));

test("every platform declaration aliases a marketing --tl-* token", () => {
  const offenders = declarations.filter(
    (d) => !/^--[a-z-]+: var\(--tl-[a-z-]+, .+\);$/.test(d) && !/^--radius: /.test(d),
  );
  assert.deepEqual(offenders, [], "these platform declarations do not read a --tl-* token");
  assert.ok(declarations.length >= 20, `only ${declarations.length} declarations; the block was gutted`);
});

test("the gold-named greens are gone from the platform block", () => {
  assert.doesNotMatch(block, /--impronta-/, "an --impronta-* row survived in .site-theme-platform");
});

/** The trees whose screens render under the class. */
const PLATFORM_TREES = [
  "src/app/(auth)",
  "src/app/onboarding",
  "src/app/account/brief",
  "src/components/auth",
  "src/components/tulala",
];

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(?:tsx?|css)$/.test(entry) && !/\.test\./.test(entry)) out.push(full);
  }
  return out;
}

test("nothing under the platform wrappers reads an --impronta-* token or utility", () => {
  const hits: string[] = [];
  for (const tree of PLATFORM_TREES) {
    for (const abs of walk(join(WEB_ROOT, tree), [])) {
      const src = readFileSync(abs, "utf8");
      const rel = relative(WEB_ROOT, abs).split(sep).join("/");
      for (const m of src.matchAll(/--impronta-[a-z-]+|\b(?:bg|text|border|ring|from|to)-impronta-[a-z-]+/g)) {
        hits.push(`${rel}: ${m[0]}`);
      }
    }
  }
  assert.deepEqual(hits, [], "a platform screen reads a token this block no longer defines");
});

test("every element carrying site-theme-platform also carries data-platform-surface=\"marketing\"", () => {
  const missing: string[] = [];
  for (const abs of walk(join(WEB_ROOT, "src"), [])) {
    if (!abs.endsWith(".tsx")) continue;
    const src = readFileSync(abs, "utf8");
    const rel = relative(WEB_ROOT, abs).split(sep).join("/");
    for (const m of src.matchAll(/className=(?:"|\{`)[^"`]*\bsite-theme-platform\b/g)) {
      // The attribute must sit on the same JSX element: look back to the
      // element's `<` and forward to its `>`.
      const open = src.lastIndexOf("<", m.index!);
      const close = src.indexOf(">", m.index!);
      const element = src.slice(open, close);
      if (!/data-platform-surface="marketing"/.test(element)) missing.push(rel);
    }
  }
  assert.deepEqual(missing, [], "site-theme-platform without data-platform-surface=\"marketing\": --tl-* is out of scope there");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * THE THIRD i18n SYSTEM — component chrome.
 *
 * Visitor-facing text reaches a page three ways, and only two of them are
 * auditable:
 *   1. the message catalog (`messages/*.json`)
 *   2. per-element overlays (`node.i18n`) — shown in the Translations panel
 *   3. STRING LITERALS baked into a section component — invisible to both
 *
 * Class 3 is why a Spanish storefront shipped "View profile" beside a
 * translated "Solicitar" button, and "Available from Aug 21" on a Spanish card
 * (2026-08-21). Nothing flagged either one: they are not in the catalog, and
 * the Translations panel cannot see them. They were found by reading the live
 * site in Spanish.
 *
 * This test fails when NEW user-visible English is hardcoded in a section
 * renderer. The fix is not to delete the string — it is to take `locale` (the
 * caller has it) and pick the wording, exactly like `FeaturedTalentCard` does.
 *
 * Deliberately narrow, so it stays quiet on the things that are not copy:
 * only JSX TEXT CHILDREN are inspected — not props, classNames, data-attrs,
 * aria-*, or comments. A string with no two consecutive letters (icons,
 * separators, "·", numerals) is ignored.
 */

const SECTIONS_DIR = path.join(process.cwd(), "src/lib/site-admin/sections");

/** Wording that is already locale-aware, i.e. chosen from a `locale` value. */
const LOCALE_AWARE = /locale\s*===|pickLocale|withLocale|useT\(|\bt\(/;

function componentFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) componentFiles(full, out);
    else if (/^Component\.tsx$|Card\.tsx$/.test(entry)) out.push(full);
  }
  return out;
}

/** JSX text children only: `>Some words<` on one line, outside a tag. */
function hardcodedSentences(source: string): string[] {
  const hits: string[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("//") || line.startsWith("*") || line.startsWith("/*")) continue;
    const m = /^>?\s*([A-Z][A-Za-z]+(?:\s+[a-zA-Z]+){1,8}[.?!]?)\s*<?$/.exec(line);
    if (!m) continue;
    const text = m[1]!;
    if (!/\p{L}{2,}(\s+\p{L}{2,})+/u.test(text)) continue;
    hits.push(text);
  }
  return hits;
}

test("no NEW user-visible English is hardcoded in a section renderer", () => {
  const offenders: string[] = [];
  for (const file of componentFiles(SECTIONS_DIR)) {
    const source = readFileSync(file, "utf8");
    if (LOCALE_AWARE.test(source)) continue; // already chooses wording by locale
    for (const text of hardcodedSentences(source)) {
      offenders.push(`${path.relative(process.cwd(), file)}: ${JSON.stringify(text)}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `Hardcoded visitor-facing English in a section renderer.\n` +
      `Take \`locale\` from the caller and choose the wording (see\n` +
      `FeaturedTalentCard's viewProfileLabel), or move it to the catalog.\n\n` +
      offenders.join("\n"),
  );
});

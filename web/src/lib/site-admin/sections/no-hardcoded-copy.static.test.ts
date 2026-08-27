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

/**
 * TENANT-STOREFRONT surfaces — what a visitor to a Spanish agency site sees.
 *
 * Deliberately NOT the whole app. Tulala's own marketing pages and the app/hub
 * landings are a different product surface with their own i18n, and scanning
 * them adds false positives (a demo fixture named "Nova Roster" is not copy to
 * translate). Widen this list when a new storefront surface ships, not to chase
 * a bigger number.
 */
const STOREFRONT_DIRS = [
  "src/lib/site-admin/sections",
  "src/app/t/[profileCode]",
].map((dir) => path.join(process.cwd(), dir));

/**
 * Strings a PR already in flight is fixing. Each entry must name the PR and
 * disappear when it lands — this is a dated handoff, not a place to park debt.
 * #1374 ("the account card spoke English on a Spanish store") rewrites these
 * exact lines; guarding them here too would collide with it.
 */
const IN_FLIGHT_FIXES = new Set([
  "Use a different email",                              // #1374
  "Save this conversation",                             // #1374
  "Your email",                                         // #1374
  "This is already the email on this conversation.",    // #1374
  "Type a message below to get started.",               // #1374
]);

/**
 * There is deliberately NO file-level "this file is locale-aware" skip.
 *
 * It used to exempt any file mentioning `locale ===`, which meant localizing
 * ONE string in a file hid every other hardcoded string in it — the guard
 * reported green on a file it had stopped reading. The line matcher below is
 * already the right filter: a localized line (`{isEs ? "…" : "…"}`) is an
 * expression, not a bare JSX text child, so it never matches in the first place.
 */

/**
 * EVERY `.tsx` under a storefront directory, not just `Component.tsx` /
 * `Card.tsx`. That narrower pattern was the guard's own blind spot: three real
 * strings sat in `AIInterpretChip.tsx` and `DirectoryReactiveGrid.tsx`, inside
 * a directory the guard already scanned, and it could not see them.
 */
function componentFiles(dir: string, out: string[] = []): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // a surface that does not exist in this checkout
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) componentFiles(full, out);
    else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) out.push(full);
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

test("no NEW user-visible English is hardcoded in a storefront component", () => {
  const offenders: string[] = [];
  for (const dir of STOREFRONT_DIRS) {
    for (const file of componentFiles(dir)) {
      const source = readFileSync(file, "utf8");
      for (const text of hardcodedSentences(source)) {
        if (IN_FLIGHT_FIXES.has(text)) continue;
        offenders.push(`${path.relative(process.cwd(), file)}: ${JSON.stringify(text)}`);
      }
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

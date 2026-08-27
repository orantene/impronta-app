import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Every marketing path is served at BOTH `/path` and `/es/path` — the sitemap
 * emits the pair for each entry. So a bare internal `href="/…"` on a marketing
 * surface silently drops a Spanish reader back onto the English page in the
 * middle of their journey. It is invisible in tests that only check that the
 * link exists, and invisible in English QA.
 *
 * The rule: internal hrefs on marketing surfaces go through `withLocaleHref`.
 *
 * This guard asserts the set of remaining bare hrefs equals the reviewed
 * allow-list EXACTLY. A stale entry fails too, so neither a new offender nor a
 * fixed-but-still-listed file can pass unnoticed.
 */

const MARKETING_DIRS = [
  "src/app/(marketing)",
  "src/components/marketing",
];

/**
 * Reviewed exceptions. Keep this list tiny and justified.
 *
 * - status/page.tsx — an operational page, deliberately EXCLUDED from the
 *   sitemap ("operational pages, not content we want ranked"). It has no
 *   locale plumbing and renders hardcoded English regardless, so prefixing its
 *   single "back to home" link would move the URL without changing what the
 *   reader sees.
 */
const ALLOWED_BARE_HREF_FILES = new Set<string>([
  "src/app/(marketing)/status/page.tsx",
]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

function findBareInternalHrefs(file: string): string[] {
  // OG image routes render a static image, not a navigable page.
  if (file.includes("opengraph-image") || file.includes("twitter-image")) return [];
  const source = readFileSync(file, "utf8");
  const hits: string[] = [];
  for (const line of source.split("\n")) {
    // `href="/…"` with a literal string is the bug. `href={…}` is either
    // already localised or a computed value this guard cannot judge.
    // `href="//host"` is protocol-relative, i.e. external.
    const match = line.match(/href="(\/(?!\/)[^"]*)"/);
    if (match) hits.push(match[1]);
  }
  return hits;
}

test("marketing internal hrefs go through withLocaleHref", () => {
  const offenders = new Map<string, string[]>();
  for (const dir of MARKETING_DIRS) {
    for (const file of walk(dir)) {
      const bare = findBareInternalHrefs(file);
      if (bare.length > 0) offenders.set(file, bare);
    }
  }

  const found = new Set(offenders.keys());

  const unexpected = [...found].filter((f) => !ALLOWED_BARE_HREF_FILES.has(f));
  assert.deepEqual(
    unexpected,
    [],
    `Bare internal href on a marketing surface. These drop Spanish readers onto ` +
      `the English page. Wrap with withLocaleHref(href, locale), or use ` +
      `MarketingCta which localises internally.\n` +
      unexpected.map((f) => `  ${f}: ${offenders.get(f)!.join(", ")}`).join("\n"),
  );

  const stale = [...ALLOWED_BARE_HREF_FILES].filter((f) => !found.has(f));
  assert.deepEqual(
    stale,
    [],
    `These files are on the bare-href allow-list but no longer have a bare ` +
      `internal href. Remove them from ALLOWED_BARE_HREF_FILES so the guard ` +
      `keeps its teeth.`,
  );
});

test("MarketingCta localises internally so every caller is covered", () => {
  const source = readFileSync("src/components/marketing/cta-link.tsx", "utf8");
  assert.match(
    source,
    /withLocaleHref\(/,
    "MarketingCta must localise its href; every marketing CTA depends on it.",
  );
  assert.match(
    source,
    /external \? href : withLocaleHref/,
    "External hrefs must be left untouched.",
  );
});

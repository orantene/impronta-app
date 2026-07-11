/**
 * registry-freeze.static.test.ts — Page Builder minimal-build W4-F5.
 *
 * WHAT THIS TEST DOES
 * ───────────────────
 * `sections/registry.ts` is the LEGACY curated-sections render system — one
 * of two parallel systems that render tenant pages (the other is
 * `builder-node`, the freeform BuilderNode-tree renderer). That registry is
 * now frozen: bug-fixes only, no new curated section kinds. New section /
 * component work goes to `builder-node`.
 *
 * This test reads the SOURCE TEXT of `sections/registry.ts`, extracts the
 * key list of the `SECTION_REGISTRY` object literal, and asserts it is
 * EXACTLY the explicit `FROZEN_SECTION_KEYS` allow-list below (order-
 * independent). Adding a new key to `SECTION_REGISTRY` — i.e. registering a
 * new legacy curated section kind — makes this test fail with a message
 * directing the author to `builder-node` instead.
 *
 * WHY FILE-TEXT SCAN (not importing SECTION_REGISTRY)?
 * ──────────────────────────────────────────────────────
 * Importing `registry.ts` pulls in ~55 section `Component.tsx` / `Editor.tsx`
 * React modules and their CSS/asset import graphs, which don't run cleanly
 * under plain `node:test`. Reading the file as UTF-8 text and extracting the
 * object-literal keys with a regex is zero-overhead and catches exactly the
 * violation we care about: a new `key: XyzSection,` line added to the map.
 *
 * SELF-CHECK (the extractor MUST work)
 * ─────────────────────────────────────
 * Before trusting the real scan, this test plants a synthetic registry-object
 * string with an extra key and asserts the extractor (a) finds the planted
 * key and (b) that comparing it against a stale allow-list fails — proving
 * the guard actually fires on a new addition, not just passes vacuously.
 *
 * Test runner: node:test + node:assert/strict
 * Run:  node_modules/.bin/tsx --test \
 *   src/lib/site-admin/sections/registry-freeze.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = join(HERE, "registry.ts");

// ── Extraction ────────────────────────────────────────────────────────────

/**
 * Extract the top-level key list from a `SECTION_REGISTRY`-shaped object
 * literal's source text (the block between `export const SECTION_REGISTRY =
 * {` and the matching `} as const;`). Skips comment lines (`// ─── ... ───`).
 *
 * Matches lines shaped like:
 *   `  hero: heroSection,`
 *   `  logo_cloud: logoCloudSection, currentVersion: 1, ...` (single-line form)
 * i.e. any line starting with `  <identifier>: ` inside the object body.
 */
function extractRegistryKeys(source: string): string[] {
  const startMarker = "export const SECTION_REGISTRY = {";
  const endMarker = "} as const;";
  const startIdx = source.indexOf(startMarker);
  assert.ok(startIdx >= 0, "could not find 'export const SECTION_REGISTRY = {' in registry.ts");
  const endIdx = source.indexOf(endMarker, startIdx);
  assert.ok(endIdx >= 0, "could not find closing '} as const;' for SECTION_REGISTRY");

  const body = source.slice(startIdx + startMarker.length, endIdx);
  const keys: string[] = [];
  const lineRe = /^\s*([a-zA-Z_][a-zA-Z0-9_]*):\s+\w+Section,/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(body)) !== null) {
    keys.push(match[1]!);
  }
  return keys;
}

// ── The frozen allow-list ─────────────────────────────────────────────────

/**
 * The exact set of legacy curated section kinds registered as of the W4-F5
 * freeze (2026-07-10). This list must NOT grow. If you're adding a new
 * curated section kind, stop — see the "FROZEN" header comment in
 * `registry.ts`: new section/component work goes to `builder-node`, not
 * here. If you're fixing a bug in an existing entry, this list is unaffected
 * and this test should still pass unchanged.
 */
const FROZEN_SECTION_KEYS: readonly string[] = [
  "hero",
  "trust_strip",
  "cta_banner",
  "category_grid",
  "talent_type_grid",
  "hero_search",
  "location_discovery",
  "editorial_split_hero",
  "destinations_mosaic",
  "testimonials_trio",
  "process_steps",
  "image_copy_alternating",
  "values_trio",
  "press_strip",
  "gallery_strip",
  "featured_talent",
  "directory",
  "marquee",
  "stats",
  "faq_accordion",
  "split_screen",
  "timeline",
  "pricing_grid",
  "team_grid",
  "contact_form",
  "join_register",
  "anchor_nav",
  "before_after",
  "content_tabs",
  "code_embed",
  "blog_index",
  "comparison_table",
  "lottie",
  "sticky_scroll",
  "masonry",
  "scroll_carousel",
  "blog_detail",
  "magazine_layout",
  "hero_split",
  "logo_cloud",
  "image_orbit",
  "video_reel",
  "map_overlay",
  "donation_form",
  "code_snippet",
  "event_listing",
  "lookbook",
  "booking_widget",
  "blank_section",
  "site_header",
  "site_footer",
  "header_search",
  "header_account",
  "header_inquiry",
  "header_favorites",
];

function sortedUnique(keys: readonly string[]): string[] {
  return [...new Set(keys)].sort();
}

// ── Self-checks: the extractor must work before we trust the real scan ────

test("W4-F5 self-check: extractor finds keys in a minimal planted registry object", () => {
  const planted = [
    "export const SECTION_REGISTRY = {",
    "  hero: heroSection,",
    "  // ── a comment line, not a key ──",
    "  logo_cloud: logoCloudSection, currentVersion: 1, Component: X, Editor: Y,",
    "} as const;",
  ].join("\n");

  const keys = extractRegistryKeys(planted);
  assert.deepEqual(
    sortedUnique(keys),
    ["hero", "logo_cloud"],
    "extractor should find exactly the two planted keys and skip the comment line",
  );
});

test("W4-F5 self-check: extractor catches a NEW key planted beyond a stale allow-list (guard actually fires)", () => {
  const staleAllowList = ["hero"];
  const plantedWithNewAddition = [
    "export const SECTION_REGISTRY = {",
    "  hero: heroSection,",
    "  brand_new_kind: brandNewKindSection,",
    "} as const;",
  ].join("\n");

  const keys = sortedUnique(extractRegistryKeys(plantedWithNewAddition));
  const added = keys.filter((k) => !staleAllowList.includes(k));

  assert.deepEqual(
    added,
    ["brand_new_kind"],
    "Self-check FAILED: the extractor/diff did not catch a new key added beyond the allow-list. " +
      "The freeze guard itself is broken — fix extractRegistryKeys() before trusting it.",
  );
});

// ── The real guard ──────────────────────────────────────────────────────

test(
  "W4-F5 FREEZE GUARD: SECTION_REGISTRY key set must exactly match the frozen allow-list",
  () => {
    const source = readFileSync(REGISTRY_PATH, "utf-8");
    const actualKeys = sortedUnique(extractRegistryKeys(source));
    const expectedKeys = sortedUnique(FROZEN_SECTION_KEYS);

    const added = actualKeys.filter((k) => !expectedKeys.includes(k));
    const removed = expectedKeys.filter((k) => !actualKeys.includes(k));

    if (added.length > 0 || removed.length > 0) {
      const parts: string[] = [];
      if (added.length > 0) {
        parts.push(
          `\nNEW legacy section kind(s) registered: ${added.join(", ")}\n\n` +
            "This registry is FROZEN (see the header comment in registry.ts). New\n" +
            "curated-section kinds are not accepted here — build the new component as\n" +
            "a builder-node freeform primitive / section-embed instead (see\n" +
            "lib/site-admin/builder-node/). If this addition is intentional and\n" +
            "approved as an exception, update FROZEN_SECTION_KEYS in this test to\n" +
            "reflect the deliberate decision.",
        );
      }
      if (removed.length > 0) {
        parts.push(
          `\nExpected legacy section kind(s) missing: ${removed.join(", ")}\n\n` +
            "A section was removed or renamed. This freeze test only blocks NEW\n" +
            "additions — existing kinds must not be deleted/renamed (they're in\n" +
            "production). If this removal is intentional, update\n" +
            "FROZEN_SECTION_KEYS in this test to match.",
        );
      }
      assert.fail(parts.join("\n"));
    }

    assert.deepEqual(actualKeys, expectedKeys);
  },
);

test("W4-F5 coverage: the frozen allow-list has no duplicate entries", () => {
  const unique = sortedUnique(FROZEN_SECTION_KEYS);
  assert.equal(
    unique.length,
    FROZEN_SECTION_KEYS.length,
    "FROZEN_SECTION_KEYS contains a duplicate entry — clean it up.",
  );
});

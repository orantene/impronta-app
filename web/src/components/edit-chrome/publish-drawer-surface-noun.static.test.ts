/**
 * publish-drawer-surface-noun.static.test.ts — the publish drawer must name the
 * surface it is actually about (builder audit leftovers, BUG 2).
 *
 * WHAT WENT WRONG: a NON-freeform cms page (a curated slot page) mounts through
 * `buildHomepageBuilderConfig` — see the "Homepage + system + slot pages"
 * branch in `edit-chrome.tsx` — so its `surfaceKind` is literally "homepage"
 * while the operator is on a named cms page. The publish drawer's title keyed
 * on `surfaceKind` alone and announced "Publish homepage" over `wave1-about`.
 * The drawer BODY copy had always keyed on `pageSlug` and said "this page", so
 * the drawer contradicted itself at the exact moment of a destructive-feeling
 * action.
 *
 * THE INVARIANT: any user-facing "homepage" noun in the publish drawer is
 * reachable only when there is no `pageSlug`. A surfaceKind-only check is the
 * bug, so this guard fails on `surfaceKind === "homepage" ?` without a
 * companion `pageSlug` term.
 *
 * WHY FILE-TEXT SCAN: importing publish-drawer.tsx pulls the React + Next +
 * server-action graph. A text scan asserts exactly the shape we mandate at
 * zero cost, matching the other *.static.test.ts guards in this directory.
 *
 * Test runner: node:test + node:assert/strict
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(HERE, rel), "utf8");

const DRAWER = read("publish-drawer.tsx");
const ES = read("editor-i18n-es.ts");

test("copy-deciding homepage checks are guarded by pageSlug", () => {
  // The two COPY sites: the drawer title noun and the success body sentence.
  assert.ok(
    DRAWER.includes('surfaceKind === "homepage" && !pageSlug'),
    "publish drawer no longer guards its homepage noun with !pageSlug — a slot cms page will be mislabelled 'Publish homepage' again",
  );
  const guarded = [...DRAWER.matchAll(/surfaceKind === "homepage" && !pageSlug/g)];
  assert.equal(
    guarded.length,
    2,
    `expected exactly 2 pageSlug-guarded homepage copy checks (drawer title noun + success body), found ${guarded.length}`,
  );
  // The remaining surfaceKind-only homepage comparisons in this file are
  // BEHAVIOURAL (which publish server action to call, whether to run the CMS
  // preflight) and are correctly slug-blind. They must still exist.
  assert.ok(
    DRAWER.includes('setPreflightLoading(surfaceKind === "homepage");'),
    "the CMS preflight gate is surfaceKind-only on purpose and should not have been slug-guarded",
  );
});

test("the site_shell surface gets its own noun, not 'page'", () => {
  assert.ok(
    DRAWER.includes('surfaceKind === "site_shell"'),
    "publish drawer must name the site shell explicitly rather than calling it a page",
  );
  assert.ok(
    DRAWER.includes('t("site shell")'),
    "the site shell noun must go through t() so it ships translated",
  );
});

test("every publish-drawer surface noun has a Spanish entry", () => {
  // Flat runtime catalog: each EN key must resolve. These are the four nouns
  // the drawer can render in its title.
  for (const [key, expected] of [
    ["template", "plantilla"],
    ["homepage", "portada"],
    ["page", "página"],
    ["site shell", "estructura del sitio"],
  ] as const) {
    const asBare = new RegExp(`(^|\\n)\\s*${key}:\\s*"`);
    const asQuoted = `"${key}":`;
    assert.ok(
      asBare.test(ES) || ES.includes(asQuoted),
      `editor-i18n-es.ts is missing the Spanish entry for the publish-drawer noun "${key}" (expected "${expected}")`,
    );
  }
});

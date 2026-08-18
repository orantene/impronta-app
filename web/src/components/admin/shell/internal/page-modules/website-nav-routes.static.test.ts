/**
 * website-nav-routes.static.test.ts — the Website sub-nav checked against the
 * two things that make one of its items actually work: a route on disk, and a
 * label in every shipped catalog.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `website-nav.ts` is a "use client" hook, so it cannot be imported into a
 * node:test run and its items cannot be asserted directly. That left three
 * silent failure modes, all of which have happened in this tree:
 *
 *   1. An item points at `${base}/<segment>` with no
 *      `admin/website/<segment>/page.tsx` stub → the sidebar links to a 404.
 *   2. An item's `i18nKey` / `descriptionI18nKey` is missing from a catalog →
 *      `createTranslator` returns the KEY ITSELF, so the sidebar renders the
 *      literal "dashboard.adminWebsite.nav.setupLabel" to a real operator.
 *      (`message-key-usage.static.test.ts` catches half of this; it reads
 *      en.json only, and these keys are read by BOTH i18n systems.)
 *   3. Design silently reverting to an `external: true` deep link, which is
 *      what `/website/design` replaced — an external item cannot be a hub and
 *      cannot read as "active" in the pill strip.
 *
 * Source text is the input on purpose: this asserts what the file SAYS, which
 * is the thing a reviewer reads and the thing that drifts.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** `web/` — derived from this file, never from cwd. */
const WEB_ROOT = resolve(HERE, "..", "..", "..", "..", "..", "..");
const NAV_SOURCE = readFileSync(join(HERE, "website-nav.ts"), "utf8");
const WEBSITE_ROUTES = join(WEB_ROOT, "src/app/(workspace)/[tenantSlug]/admin/website");

/** Every `href: \`${base}/<segment>\`` in the nav config. */
function navSegments(source: string): string[] {
  return [...source.matchAll(/href:\s*`\$\{base\}\/([a-z-]+)`/g)].map((m) => m[1]!);
}

/** Every catalog key literal the nav config hands to `t()`. */
function navMessageKeys(source: string): string[] {
  return [...source.matchAll(/"(dashboard\.adminWebsite\.nav\.[A-Za-z]+)"/g)].map((m) => m[1]!);
}

function lookup(catalog: unknown, dotted: string): unknown {
  return dotted
    .split(".")
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[part] : undefined,
      catalog,
    );
}

test("every Website sub-nav segment has a route stub on disk", () => {
  const segments = navSegments(NAV_SOURCE);
  // Guards the regex itself: a rename that breaks the match would otherwise
  // make this test pass by checking nothing.
  assert.ok(segments.length >= 5, `expected the nav to route at least 5 segments, saw ${segments.length}`);
  assert.ok(segments.includes("design"), "Design must route to /website/design");
  assert.ok(segments.includes("setup"), "Setup must route to /website/setup");
  for (const segment of segments) {
    assert.ok(
      existsSync(join(WEBSITE_ROUTES, segment, "page.tsx")),
      `website-nav.ts links to /website/${segment} but admin/website/${segment}/page.tsx does not exist`,
    );
  }
});

test("every Website sub-nav label resolves in every shipped catalog", () => {
  const keys = navMessageKeys(NAV_SOURCE);
  assert.ok(keys.length >= 12, `expected at least 12 nav catalog keys, saw ${keys.length}`);
  for (const locale of ["en", "es", "fr"]) {
    const catalog = JSON.parse(readFileSync(join(WEB_ROOT, "messages", `${locale}.json`), "utf8"));
    for (const key of keys) {
      assert.equal(
        typeof lookup(catalog, key),
        "string",
        `${key} is missing from messages/${locale}.json — the sidebar would render the raw key`,
      );
    }
  }
});

test("no Website sub-nav item opens externally (Design is a hub route now)", () => {
  assert.ok(
    !/external:\s*true/.test(NAV_SOURCE),
    "a sub-nav item is marked external; /website/design replaced the external theme deep link",
  );
});

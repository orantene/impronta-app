/**
 * DEFAULT PAGES CONTRACT — what a brand-new workspace is guaranteed.
 *
 * Two things are pinned here:
 *
 *   1. The seeded 404 page's shape: a real, editable, never-indexed page whose
 *      only link is one the platform can always honour.
 *   2. The `/contact` resolution. Owner call: no placeholder contact page is
 *      seeded, so NO default template may link to `/contact`. On an agency host
 *      `/contact` is a CMS clean-URL (proxy.ts rewrites unmatched single-segment
 *      paths to `/p/<slug>`), so it 404s until the operator creates such a page.
 *      This test reads the default-template SOURCES, which is the only way to
 *      catch a link reintroduced by hand in a tree literal.
 *
 * Run: npx tsx --test src/lib/site-admin/server/default-pages-contract.test.ts
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  NOT_FOUND_PAGE_SLUG,
  buildNotFoundPageTree,
} from "./onboard-notfound-page";
import { directoryPageCapabilityEnabled } from "./onboard-directory-page";
import {
  BOOKING_SYSTEM_KEY,
  RESERVED_BOOKING_SLUG,
  bookingPageCapabilityEnabled,
  buildBookingPageTree,
} from "./onboard-booking-page";
import { buildFreeStarterEntries } from "./onboard-starter-content-entries";
import { isReservedSlug } from "@/lib/site-admin/reserved-routes";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

function flatten(nodes: readonly BuilderNode[]): BuilderNode[] {
  const out: BuilderNode[] = [];
  const walk = (list: readonly BuilderNode[]) => {
    for (const node of list) {
      out.push(node);
      const kids = (node as { children?: readonly BuilderNode[] }).children;
      if (Array.isArray(kids)) walk(kids);
    }
  };
  walk(nodes);
  return out;
}

// ── 1. The 404 page ─────────────────────────────────────────────────────────

test("the 404 slug is neither platform-reserved nor a fenced system slug", () => {
  // `not-found` IS reserved and `__…__` slugs are rejected as role targets by
  // page-roles-shape.cleanSlug, which is why the seed uses "404".
  assert.equal(isReservedSlug(NOT_FOUND_PAGE_SLUG), false);
  assert.equal(NOT_FOUND_PAGE_SLUG.startsWith("__"), false);
});

test("the seeded 404 links ONLY to the homepage", () => {
  const nodes = flatten(buildNotFoundPageTree());
  const hrefs = nodes
    .map((n) => (n.props as { href?: unknown }).href)
    .filter((h): h is string => typeof h === "string");
  assert.ok(hrefs.length > 0, "expected at least one link");
  // A 404 that links to another 404 is worse than a 404 with no links, and
  // every other storefront path is conditional on content the workspace may
  // not have yet.
  assert.deepEqual([...new Set(hrefs)], ["/"]);
});

test("the seeded 404 carries Spanish copy as a per-node i18n overlay", () => {
  const nodes = flatten(buildNotFoundPageTree());
  const translated = nodes.filter((n) => n.i18n?.es);
  // Heading, body, and the CTA label — every string a visitor reads.
  assert.ok(
    translated.length >= 3,
    `expected at least 3 nodes with an es overlay, got ${translated.length}`,
  );
  assert.doesNotMatch(
    JSON.stringify(translated),
    /—/,
    "no em dashes in user-facing copy",
  );
});

// ── 2. The directory capability key ─────────────────────────────────────────

test("the directory page is keyed on workspace shape, never on plan", () => {
  // A talent workspace with a roster gets it…
  assert.equal(
    directoryPageCapabilityEnabled({ workspaceType: "talent", activeRosterCount: 1 }),
    true,
  );
  // …a talent workspace with nobody on the roster does not, yet.
  assert.equal(
    directoryPageCapabilityEnabled({ workspaceType: "talent", activeRosterCount: 0 }),
    false,
  );
  // …and a business-type (Website tier) workspace never does, at any price.
  assert.equal(
    directoryPageCapabilityEnabled({ workspaceType: "business", activeRosterCount: 9 }),
    false,
  );
  // An unknown type fails open toward "talent" (lib/saas/workspace-type.ts).
  assert.equal(
    directoryPageCapabilityEnabled({ workspaceType: null, activeRosterCount: 3 }),
    true,
  );
});

// ── 3. No default may link to a page the platform does not provision ────────

const DEFAULT_TEMPLATE_SOURCES = [
  "src/lib/site-admin/builder-core/templates/shell-variant-trees.ts",
  "src/lib/site-admin/builder-node/create.ts",
  "src/lib/site-admin/sections/shared/default-content.ts",
  "src/lib/site-admin/server/onboard-starter-content-entries.ts",
  "src/lib/site-admin/server/default-storefront-tree.ts",
  "src/lib/site-admin/server/onboard-notfound-page.ts",
  "src/lib/site-admin/server/onboard-booking-page.ts",
];

test("no default shell / nav / starter template links to /contact", () => {
  const offenders: string[] = [];
  for (const rel of DEFAULT_TEMPLATE_SOURCES) {
    const source = readFileSync(path.join(process.cwd(), rel), "utf8");
    for (const [index, line] of source.split("\n").entries()) {
      // Comments explain WHY the link is absent, so only real string literals
      // count.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      if (/["'`](\/p)?\/contact["'`]/.test(line)) {
        offenders.push(`${rel}:${index + 1}: ${line.trim()}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "A default template links to /contact, but no contact page is seeded. On an " +
      "agency host /contact is a CMS clean-URL that 404s until the operator " +
      "creates that page. Drop the link or point it at a path the platform " +
      "always serves (/ or /directory).",
  );
});

test("the booking page is fenced and always-on", () => {
  assert.equal(RESERVED_BOOKING_SLUG, "__book__");
  assert.equal(BOOKING_SYSTEM_KEY, "booking");
  assert.equal(bookingPageCapabilityEnabled(), true);
  const hrefs = flatten(buildBookingPageTree())
    .map((n) => (n.props as { href?: unknown }).href)
    .filter((h): h is string => typeof h === "string");
  assert.deepEqual([...new Set(hrefs)], ["/book"]);
  assert.doesNotMatch(JSON.stringify(buildBookingPageTree()), /—/);
});

test("the seeded starter homepage's CTAs point at paths a fresh workspace serves", () => {
  const entries = buildFreeStarterEntries("Studio Name", "agency");
  const hrefs = JSON.stringify(entries).match(/"href":"([^"]+)"/g) ?? [];
  assert.ok(hrefs.length > 0, "expected the starter to carry CTAs");
  for (const raw of hrefs) {
    const href = raw.slice('"href":"'.length, -1);
    assert.ok(
      href === "/" || href === "/directory" || /^https?:/.test(href),
      `starter CTA points at ${href}, which a brand-new workspace does not serve`,
    );
  }
});

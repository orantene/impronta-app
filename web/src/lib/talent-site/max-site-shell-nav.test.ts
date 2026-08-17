/**
 * Talent Max site — shell header nav hydration, validated against the REAL
 * `site_header` schema.
 *
 * WHY THIS FILE EXISTS SEPARATELY from `resolve-max-site-core.test.ts`: this one
 * imports the actual zod schema. `resolve-max-site-core.ts` is a PURE core with
 * no runtime imports, so it cannot import the schema to share the cap constants —
 * it hardcodes them. These tests are what stop the two from drifting: they assert
 * that what `hydrateShellNav` emits genuinely satisfies the schema the renderer
 * parses.
 *
 * THE FAILURE MODE THIS GUARDS IS NOT A DEGRADED NAV — IT IS NO HEADER AT ALL.
 * `render-max-site.tsx` does `schema.safeParse(root.props.sectionProps)` and
 * `return null` when it fails. `navItems` is capped at 8 with labels 1..60, so a
 * site with a 9th page, or a page titled with 61+ characters, would delete the
 * entire header rather than trim the nav.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMaxSiteNav,
  hydrateShellNav,
  type MaxSitePageRow,
} from "./resolve-max-site-core";
import { buildDefaultShellTree } from "./default-max-site-trees";
import { siteHeaderSchemaV1 } from "@/lib/site-admin/sections/site_header/schema";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

function page(partial: Partial<MaxSitePageRow> & { slug: string }): MaxSitePageRow {
  return {
    id: `id-${partial.slug}`,
    title: partial.title ?? partial.slug,
    navLabel: partial.navLabel ?? null,
    status: partial.status ?? "published",
    isHome: partial.isHome ?? false,
    sortOrder: partial.sortOrder ?? 0,
    blocks: partial.blocks ?? [],
    theme: partial.theme ?? {},
    metaTitle: partial.metaTitle ?? null,
    metaDescription: partial.metaDescription ?? null,
    ogTitle: partial.ogTitle ?? null,
    ogDescription: partial.ogDescription ?? null,
    ogImageUrl: partial.ogImageUrl ?? null,
    canonicalUrl: partial.canonicalUrl ?? null,
    noindex: partial.noindex ?? null,
    jsonLd: partial.jsonLd ?? null,
    ...partial,
  };
}

/** Hydrate the real default shell with N pages and return the header config. */
function hydratedHeaderConfig(pages: MaxSitePageRow[]): Record<string, unknown> {
  const hydrated = hydrateShellNav(
    buildDefaultShellTree({ displayName: "Morena" }),
    buildMaxSiteNav(pages),
    "morena",
  );
  const header = hydrated.find(
    (n: BuilderNode) =>
      n.kind === "section" &&
      (n.props as { sectionTypeKey?: unknown }).sectionTypeKey === "site_header",
  );
  assert.ok(header, "default shell must expose a site_header landmark");
  return (header.props as { sectionProps?: Record<string, unknown> })
    .sectionProps as Record<string, unknown>;
}

test("[shell-nav] hydrated header config PARSES against the real site_header schema", () => {
  // The renderer returns null for the whole header on a parse failure, so this
  // is the test that matters most.
  const cfg = hydratedHeaderConfig([
    page({ slug: "home", isHome: true, sortOrder: 0, title: "Home" }),
    page({ slug: "gallery", sortOrder: 1, title: "Gallery" }),
    page({ slug: "contact", sortOrder: 2, title: "Contact" }),
  ]);
  const parsed = siteHeaderSchemaV1.safeParse(cfg);
  assert.equal(
    parsed.success,
    true,
    `hydrated header must parse, else the renderer drops it: ${
      parsed.success ? "" : JSON.stringify(parsed.error.issues)
    }`,
  );
});

test("[shell-nav] a site with MORE than 8 pages still yields a parseable header", () => {
  // navItems is capped at 8. Without the cap this emits 12 and the header
  // vanishes entirely on the live site.
  const pages = Array.from({ length: 12 }, (_, i) =>
    page({ slug: `p${i}`, sortOrder: i, title: `Page ${i}`, isHome: i === 0 }),
  );
  const cfg = hydratedHeaderConfig(pages);
  const items = cfg.navItems as { label: string }[];
  assert.equal(items.length, 8, "navItems must be capped at the schema maximum");
  assert.equal(siteHeaderSchemaV1.safeParse(cfg).success, true);
});

test("[shell-nav] an over-long page title is truncated, not left to fail the schema", () => {
  const long = "L".repeat(200);
  const cfg = hydratedHeaderConfig([
    page({ slug: "home", isHome: true, sortOrder: 0, title: long }),
  ]);
  const items = cfg.navItems as { label: string }[];
  assert.ok(items[0]!.label.length <= 60, "label must fit the schema's max(60)");
  assert.equal(siteHeaderSchemaV1.safeParse(cfg).success, true);
});

test("[shell-nav] no published pages leaves the seeded header untouched", () => {
  // Never blank a header that currently renders.
  const cfg = hydratedHeaderConfig([page({ slug: "draft", status: "draft" })]);
  assert.deepEqual(cfg.navItems, [{ label: "Home", href: "/" }]);
  assert.equal(siteHeaderSchemaV1.safeParse(cfg).success, true);
});

test("[shell-nav] locale prefix is threaded into every nav href and the brand", () => {
  const hydrated = hydrateShellNav(
    buildDefaultShellTree({ displayName: "Morena" }),
    buildMaxSiteNav([
      page({ slug: "home", isHome: true, sortOrder: 0, title: "Home" }),
      page({ slug: "gallery", sortOrder: 1, title: "Gallery" }),
    ]),
    "morena",
    "/es",
  );
  const header = hydrated.find(
    (n: BuilderNode) =>
      n.kind === "section" &&
      (n.props as { sectionTypeKey?: unknown }).sectionTypeKey === "site_header",
  )!;
  const cfg = (header.props as { sectionProps: Record<string, unknown> })
    .sectionProps;
  assert.deepEqual(
    (cfg.navItems as { href: string }[]).map((i) => i.href),
    ["/es/t/site/morena", "/es/t/site/morena/gallery"],
  );
  assert.equal((cfg.brand as { href: string }).href, "/es/t/site/morena");
});

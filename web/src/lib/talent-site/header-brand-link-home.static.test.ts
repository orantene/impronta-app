/**
 * W4-1 / TUL-516: every collection theme header brand must link site home.
 * site_header → brand.href; Gridline utility_bar → homeHref. Hydrate rewrites
 * the seeded "/" to the live site home URL.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import type { BuilderNode, BuilderUtilityBarNode } from "@/lib/site-admin/builder-node/types";
import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import { COLLECTION_DESIGNS } from "./theme-catalog/collection/designs";
import { buildDesignTrees, fallbackHydrationTokens } from "./server/theme-apply-core";
import { buildMaxSiteNav, hydrateShellNav, type MaxSitePageRow } from "./resolve-max-site-core";

const HERE = dirname(fileURLToPath(import.meta.url));

type Rec = Record<string, unknown>;

function page(slug: string, isHome = false): MaxSitePageRow {
  return {
    id: `id-${slug}`,
    title: slug,
    navLabel: null,
    status: "published",
    isHome,
    sortOrder: isHome ? 0 : 1,
    blocks: [],
    theme: {},
    metaTitle: null,
    metaDescription: null,
    ogTitle: null,
    ogDescription: null,
    ogImageUrl: null,
    canonicalUrl: null,
    noindex: null,
    jsonLd: null,
    slug,
  };
}

function findUtilityBar(node: BuilderNode): BuilderUtilityBarNode | undefined {
  if (node.kind === "utility_bar") return node as BuilderUtilityBarNode;
  for (const child of (node as { children?: BuilderNode[] }).children ?? []) {
    const hit = findUtilityBar(child);
    if (hit) return hit;
  }
  return undefined;
}

function findSiteHeader(tree: BuilderNode[]): BuilderNode | undefined {
  return tree.find(
    (n) => n.kind === "section" && (n.props as Rec).sectionTypeKey === "site_header",
  );
}

function brandHrefOf(header: BuilderNode): string {
  const sp = ((header.props as Rec).sectionProps ?? {}) as Rec;
  const brand = (sp.brand ?? {}) as Rec;
  return String(brand.href ?? "");
}

test("source: hydrateShellNav rewrites utility_bar.homeHref like site_header.brand.href", () => {
  const src = readFileSync(resolve(HERE, "resolve-max-site-core.ts"), "utf8");
  assert.match(src, /node\.kind === "utility_bar"/);
  assert.match(src, /homeHref:\s*brandHref/);
});

test("source: utility_bar render wraps logo+name in a home anchor", () => {
  const src = readFileSync(
    resolve(HERE, "../site-admin/builder-node/utility-bar-block.tsx"),
    "utf8",
  );
  assert.match(src, /className="sb-ub-brand"/);
  assert.match(src, /data-ub-brand-home="true"/);
  assert.match(src, /prefixPublicHref/);
});

for (const d of COLLECTION_DESIGNS) {
  test(`${d.slug}: header brand links site home after hydrate`, () => {
    const tokens = fallbackHydrationTokens("brand-home-qa");
    const built = buildDesignTrees(d.buildPayload(), tokens);
    assert.equal(built.ok, true);
    if (!built.ok) return;

    const nav = buildMaxSiteNav([page("home", true), page("politicas")]);
    const hydrated = hydrateShellNav(built.shellTree, nav, "brand-home-qa");
    const home = "/t/site/brand-home-qa";

    const bar = hydrated.map(findUtilityBar).find(Boolean);
    if (bar) {
      assert.equal(bar.props.homeHref, home, `${d.slug}: utility_bar.homeHref`);
      const html = renderToStaticMarkup(
        renderBuilderNodes([bar as BuilderNode], {
          mode: "freeform",
          includeRendererStyles: false,
          includeFontLinks: false,
          dataSources: {},
        }) as Parameters<typeof renderToStaticMarkup>[0],
      );
      const escaped = home.replace(/\//g, "\\/");
      assert.match(html, new RegExp(`class="sb-ub-brand"[^>]*href="${escaped}"`));
      assert.match(html, /data-ub-brand-home="true"/);
      return;
    }

    const header = findSiteHeader(hydrated);
    assert.ok(header, `${d.slug}: expected site_header or utility_bar`);
    assert.equal(brandHrefOf(header!), home, `${d.slug}: site_header.brand.href`);
  });
}

test("stale kit shell: Wordmark heading href rewrites to site home", () => {
  const shell: BuilderNode[] = [
    {
      id: "hdr",
      kind: "container",
      props: { layout: "row", layerLabel: "Header" },
      children: [
        { id: "b", kind: "heading", props: { text: "Valeria", level: 2, layerLabel: "Wordmark", href: "/" } },
        {
          id: "n",
          kind: "nav",
          props: { links: [{ id: "l1", label: "Sessions", href: "#services" }] },
        },
      ],
    } as BuilderNode,
  ];
  const nav = buildMaxSiteNav([page("home", true), page("politicas")]);
  const hydrated = hydrateShellNav(shell, nav, "valeria");
  const brand = (hydrated[0] as { children: BuilderNode[] }).children.find((c) => c.kind === "heading")!;
  assert.equal((brand.props as { href?: string }).href, "/t/site/valeria");
});

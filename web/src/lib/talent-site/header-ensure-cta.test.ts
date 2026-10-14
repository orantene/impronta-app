/**
 * TUL-530 / GRK-081: every theme header shape gets a primary CTA.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { COLLECTION_DESIGNS } from "./theme-catalog/collection/designs";
import { buildKitShell } from "./theme-catalog/section-kit-shell";
import { buildDesignTrees, fallbackHydrationTokens } from "./server/theme-apply-core";
import { buildMaxSiteNav, hydrateShellNav, type MaxSitePageRow } from "./resolve-max-site-core";
import { ensureHeaderCta } from "./header-ensure-cta";

type Rec = Record<string, unknown>;
type AnyNode = BuilderNode & { children?: BuilderNode[] };

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

function walk(nodes: readonly BuilderNode[], fn: (n: BuilderNode) => void) {
  for (const n of nodes) {
    fn(n);
    const kids = (n as AnyNode).children;
    if (Array.isArray(kids)) walk(kids, fn);
  }
}

function headerHasCta(tree: readonly BuilderNode[]): boolean {
  let ok = false;
  walk(tree, (n) => {
    if (n.kind === "utility_bar") {
      const p = (n.props ?? {}) as Rec;
      if (String(p.ctaLabel ?? "").trim() && String(p.ctaHref ?? "").trim()) ok = true;
    }
    if (n.kind === "section" && (n.props as Rec).sectionTypeKey === "site_header") {
      const sp = ((n.props as Rec).sectionProps ?? {}) as Rec;
      const cta = sp.primaryCta as Rec | undefined;
      if (cta && String(cta.label ?? "").trim() && String(cta.href ?? "").trim()) ok = true;
      const regions = sp.regions as Rec | undefined;
      if (regions) {
        for (const items of Object.values(regions)) {
          if (
            Array.isArray(items) &&
            items.some((it) => it && typeof it === "object" && (it as Rec).type === "cta")
          ) {
            ok = true;
          }
        }
      }
    }
    if (n.kind === "button" && String(((n.props ?? {}) as Rec).layerLabel ?? "") === "Header CTA") {
      ok = true;
    }
  });
  return ok;
}

test("ensureHeaderCta injects Book → #book on a bare kit heading+nav shell", () => {
  const shell: BuilderNode[] = [
    {
      id: "hdr",
      kind: "container",
      props: { layout: "row", layerLabel: "Header" },
      children: [
        { id: "b", kind: "heading", props: { text: "Valeria", level: 2, layerLabel: "Wordmark" } },
        {
          id: "n",
          kind: "nav",
          props: { links: [{ id: "l1", label: "Sessions", href: "#services" }] },
        },
      ],
    } as BuilderNode,
  ];
  const out = ensureHeaderCta(shell);
  assert.equal(headerHasCta(out), true);
  const btn = (out[0] as AnyNode).children!.find((c) => c.kind === "button")!;
  assert.equal((btn.props as Rec).href, "#book");
  assert.equal((btn.props as Rec).label, "Book");
});

test("ensureHeaderCta fills an empty utility_bar CTA", () => {
  const shell: BuilderNode[] = [
    {
      id: "ub",
      kind: "utility_bar",
      props: { name: "Alex", ctaLabel: "", ctaHref: "" },
    } as BuilderNode,
  ];
  const out = ensureHeaderCta(shell);
  assert.equal((out[0]!.props as Rec).ctaLabel, "Book");
  assert.equal((out[0]!.props as Rec).ctaHref, "#book");
});

test("ensureHeaderCta rewrites a scroll-only Book CTA to #book (E6-kbd-open)", () => {
  const shell: BuilderNode[] = [
    {
      id: "ub",
      kind: "utility_bar",
      props: { name: "Karla", ctaLabel: "Agendar visita", ctaHref: "#services" },
    } as BuilderNode,
  ];
  const out = ensureHeaderCta(shell);
  assert.equal((out[0]!.props as Rec).ctaHref, "#book");
  assert.equal((out[0]!.props as Rec).ctaLabel, "Agendar visita");
});

test("buildKitShell without utilityBar seeds brand href + Header CTA", () => {
  let i = 0;
  const shell = buildKitShell(() => `id-${++i}`, { displayName: "Diego" });
  const header = shell[0] as AnyNode;
  const brand = header.children!.find((c) => c.kind === "heading")!;
  assert.equal((brand.props as Rec).href, "/");
  assert.ok(header.children!.some((c) => c.kind === "button"));
});

for (const d of COLLECTION_DESIGNS) {
  test(`${d.slug}: header has a CTA after hydrate`, () => {
    const tokens = fallbackHydrationTokens("cta-qa");
    const built = buildDesignTrees(d.buildPayload(), tokens);
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const nav = buildMaxSiteNav([page("home", true)]);
    const hydrated = hydrateShellNav(built.shellTree, nav, "cta-qa");
    assert.equal(headerHasCta(hydrated), true, `${d.slug}: missing header CTA`);
  });
}

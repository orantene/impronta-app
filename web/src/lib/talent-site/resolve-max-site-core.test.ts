import test from "node:test";
import assert from "node:assert/strict";

import {
  TALENT_MAX_PLAN_KEY,
  buildMaxSiteNav,
  coerceTree,
  hydrateShellNav,
  maxSitePageHref,
  maxSitePublicGate,
  selectMaxSitePage,
  type MaxSitePageRow,
} from "./resolve-max-site-core";
import { buildDefaultShellTree } from "./default-max-site-trees";
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

// ── maxSitePublicGate ────────────────────────────────────────────────────────

test("gate: published + Max plan → open", () => {
  assert.equal(
    maxSitePublicGate({
      sitePublishedAt: "2026-06-16T00:00:00Z",
      planKey: TALENT_MAX_PLAN_KEY,
    }),
    true,
  );
});

test("gate: unpublished site → closed even on Max", () => {
  assert.equal(
    maxSitePublicGate({ sitePublishedAt: null, planKey: TALENT_MAX_PLAN_KEY }),
    false,
  );
});

test("gate: lapsed plan (Pro/Free) → closed even when published", () => {
  for (const planKey of ["talent_pro", "talent_basic", null, undefined, "free"]) {
    assert.equal(
      maxSitePublicGate({ sitePublishedAt: "2026-06-16T00:00:00Z", planKey }),
      false,
      `planKey=${String(planKey)} must close the gate`,
    );
  }
});

test("gate: owner draft preview bypasses publish + plan", () => {
  assert.equal(
    maxSitePublicGate({
      sitePublishedAt: null,
      planKey: null,
      isOwnerDraftPreview: true,
    }),
    true,
  );
});

// ── selectMaxSitePage ────────────────────────────────────────────────────────

test("select: bare URL picks the is_home page", () => {
  const pages = [
    page({ slug: "about", sortOrder: 1 }),
    page({ slug: "home", isHome: true, sortOrder: 0 }),
  ];
  const got = selectMaxSitePage(pages, { requirePublished: true });
  assert.equal(got?.slug, "home");
});

test("select: bare URL falls back to lowest-sort page when no is_home", () => {
  const pages = [
    page({ slug: "z", sortOrder: 5 }),
    page({ slug: "a", sortOrder: 1 }),
  ];
  const got = selectMaxSitePage(pages, { requirePublished: true });
  assert.equal(got?.slug, "a");
});

test("select: pageSlug picks the matching page", () => {
  const pages = [
    page({ slug: "home", isHome: true }),
    page({ slug: "gallery" }),
  ];
  const got = selectMaxSitePage(pages, {
    pageSlug: "gallery",
    requirePublished: true,
  });
  assert.equal(got?.slug, "gallery");
});

test("select: requirePublished drops draft pages (public path)", () => {
  const pages = [page({ slug: "secret", status: "draft" })];
  assert.equal(
    selectMaxSitePage(pages, { pageSlug: "secret", requirePublished: true }),
    null,
  );
  // Owner preview keeps drafts.
  assert.equal(
    selectMaxSitePage(pages, { pageSlug: "secret", requirePublished: false })?.slug,
    "secret",
  );
});

test("select: unknown slug → null", () => {
  const pages = [page({ slug: "home", isHome: true })];
  assert.equal(
    selectMaxSitePage(pages, { pageSlug: "nope", requirePublished: true }),
    null,
  );
});

// ── buildMaxSiteNav ──────────────────────────────────────────────────────────

test("nav: published pages ordered by sort then slug; label fallbacks", () => {
  const pages = [
    page({ slug: "contact", sortOrder: 2, navLabel: "Get in touch" }),
    page({ slug: "home", isHome: true, sortOrder: 0, title: "Welcome" }),
    page({ slug: "draft-page", status: "draft", sortOrder: 1 }),
    page({ slug: "gallery", sortOrder: 1, title: "" }),
  ];
  const nav = buildMaxSiteNav(pages);
  assert.deepEqual(
    nav.map((n) => [n.slug, n.label, n.isHome]),
    [
      ["home", "Welcome", true],
      ["gallery", "gallery", false], // empty title → slug
      ["contact", "Get in touch", false], // navLabel preferred
    ],
  );
});

// ── maxSitePageHref ──────────────────────────────────────────────────────────

test("href: home → bare site URL; inner → /<slug>; locale prefix honored", () => {
  assert.equal(
    maxSitePageHref("morena", { slug: "home", isHome: true }),
    "/t/site/morena",
  );
  assert.equal(
    maxSitePageHref("morena", { slug: "gallery", isHome: false }),
    "/t/site/morena/gallery",
  );
  assert.equal(
    maxSitePageHref("morena", { slug: "gallery", isHome: false }, "/es"),
    "/es/t/site/morena/gallery",
  );
});

// ── hydrateShellNav ──────────────────────────────────────────────────────────

test("hydrateShellNav injects page links into the shell's nav node", () => {
  const shell = buildDefaultShellTree({ displayName: "Morena" });
  const nav = buildMaxSiteNav([
    page({ slug: "home", isHome: true, sortOrder: 0, title: "Home" }),
    page({ slug: "gallery", sortOrder: 1, title: "Gallery" }),
  ]);
  const hydrated = hydrateShellNav(shell, nav, "morena");

  // Find the nav node inside the header container.
  const header = hydrated[0] as { children: BuilderNode[] };
  const navNode = header.children.find((n) => n.kind === "nav") as {
    props: { links: { label: string; href: string }[]; brandHref: string };
  };
  assert.deepEqual(
    navNode.props.links.map((l) => [l.label, l.href]),
    [
      ["Home", "/t/site/morena"],
      ["Gallery", "/t/site/morena/gallery"],
    ],
  );
  // brandHref points at the home page.
  assert.equal(navNode.props.brandHref, "/t/site/morena");
});

test("hydrateShellNav is non-mutating and leaves a nav-less shell unchanged", () => {
  const shell: BuilderNode[] = [
    {
      id: "c",
      kind: "container",
      props: { layout: "stack" },
      children: [],
    } as BuilderNode,
  ];
  const before = JSON.stringify(shell);
  const out = hydrateShellNav(
    shell,
    buildMaxSiteNav([page({ slug: "home", isHome: true })]),
    "x",
  );
  assert.equal(JSON.stringify(shell), before, "input not mutated");
  // No nav node → structurally equal content.
  assert.deepEqual(out, shell);
});

test("hydrateShellNav with no published pages returns the shell unchanged", () => {
  const shell = buildDefaultShellTree({ displayName: "Morena" });
  const out = hydrateShellNav(shell, [], "morena");
  assert.deepEqual(out, shell);
});

// ── coerceTree ───────────────────────────────────────────────────────────────

test("coerceTree: arrays pass through, non-arrays degrade to []", () => {
  const arr = [{ id: "a", kind: "heading", props: {} }];
  assert.equal(coerceTree(arr), arr);
  assert.deepEqual(coerceTree(null), []);
  assert.deepEqual(coerceTree({}), []);
  assert.deepEqual(coerceTree("nope"), []);
});

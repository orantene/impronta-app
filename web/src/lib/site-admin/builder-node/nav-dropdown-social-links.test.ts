import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode, createSocialLinks, createNav } from "./create";
import { validateBuilderNodeTree } from "./validate";
import {
  BUILDER_DATA_SOURCE_REGISTRY,
  getBuilderDataSourceDefinition,
} from "./data-bindings";
import { BUILDER_NODE_REGISTRY } from "./registry";
import {
  navLinksFromRecords,
  renderBuilderNodes,
  type BuilderNodeRenderDataSources,
} from "./render";
import type {
  BuilderNavNode,
  BuilderNode,
  BuilderSocialLinksNode,
} from "./types";

function renderHtml(
  nodes: BuilderNode[],
  dataSources?: BuilderNodeRenderDataSources,
): string {
  return renderToStaticMarkup(
    createElement(
      Fragment,
      null,
      renderBuilderNodes(nodes, { publicPathPrefix: "", dataSources }),
    ),
  );
}

// `nav` + `social_links` are layout-shell CHILDREN (not root-droppable), so
// wrap them in a container to validate them the way the shell composes them.
function wrapInContainer(node: BuilderNode): BuilderNode {
  return {
    id: `root-${node.id}`,
    kind: "container",
    props: { layout: "stack" },
    children: [node],
  };
}

// ── A3 — nav submenu (children) backward-compat + round-trip ────────────────

function validateInner(node: BuilderNode): { ok: boolean; inner: BuilderNode } {
  const result = validateBuilderNodeTree([wrapInContainer(node)]);
  const root = result.tree[0] as BuilderNode & { children: BuilderNode[] };
  return { ok: result.ok, inner: root?.children?.[0] };
}

test("flat nav with no children round-trips byte-identically through validate", () => {
  const nav = createNav() as BuilderNavNode;
  // Sanity: the default nav has no submenus.
  assert.ok(nav.props.links.every((link) => link.children === undefined));
  const { ok, inner } = validateInner(nav);
  assert.equal(ok, true);
  assert.deepEqual(inner, nav);
  // No new keys leaked onto a flat link.
  const firstLink = (inner as BuilderNavNode).props.links[0]!;
  assert.deepEqual(Object.keys(firstLink).sort(), ["href", "id", "label"]);
});

test("nav links with a one-level submenu survive validate", () => {
  const nav: BuilderNavNode = {
    id: "nav-1",
    kind: "nav",
    props: {
      submenuVariant: "mega",
      links: [
        { id: "l1", label: "Flat", href: "/flat" },
        {
          id: "l2",
          label: "Work",
          href: "/work",
          children: [
            { id: "c1", label: "Photography", href: "/work/photo" },
            { id: "c2", label: "Film", href: "/work/film" },
          ],
        },
      ],
    },
  };
  const { ok, inner } = validateInner(nav);
  assert.equal(ok, true);
  const out = inner as BuilderNavNode;
  assert.equal(out.props.submenuVariant, "mega");
  // Flat link keeps no children key.
  assert.equal(out.props.links[0]!.children, undefined);
  // Submenu children preserved in order.
  assert.deepEqual(
    out.props.links[1]!.children?.map((c) => c.id),
    ["c1", "c2"],
  );
});

test("nav submenu nesting is capped at one level (grandchildren stripped)", () => {
  const nav = {
    id: "nav-2",
    kind: "nav" as const,
    props: {
      links: [
        {
          id: "l1",
          label: "Work",
          href: "/work",
          children: [
            {
              id: "c1",
              label: "Photography",
              href: "/work/photo",
              // A second level — must be stripped by the schema.
              children: [{ id: "g1", label: "Deep", href: "/deep" }],
            },
          ],
        },
      ],
    },
  };
  const { ok, inner } = validateInner(nav as unknown as BuilderNode);
  assert.equal(ok, true);
  const child = (inner as BuilderNavNode).props.links[0]!.children![0]!;
  assert.equal(
    (child as { children?: unknown }).children,
    undefined,
    "grandchildren must not survive validation",
  );
});

// ── A4 — social_links node create + validate ────────────────────────────────

test("createSocialLinks produces a valid node", () => {
  const node = createSocialLinks() as BuilderSocialLinksNode;
  assert.equal(node.kind, "social_links");
  assert.ok(node.props.links.length > 0);
  const { ok } = validateInner(node);
  assert.equal(ok, true);
});

test("createBuilderNode('social_links') is registered + valid", () => {
  assert.ok(BUILDER_NODE_REGISTRY.social_links);
  const node = createBuilderNode("social_links");
  assert.equal(node.kind, "social_links");
  const { ok } = validateInner(node);
  assert.equal(ok, true);
});

test("social_links rejects an unknown platform", () => {
  const node: BuilderNode = {
    id: "soc-1",
    kind: "social_links",
    props: {
      links: [{ id: "s1", platform: "myspace" as never, href: "https://x.com/" }],
    },
  };
  // Wrapped or not, an invalid platform must fail validation.
  const result = validateBuilderNodeTree([wrapInContainer(node)]);
  assert.equal(result.ok, false);
});

test("social_links accepts an optional workspace_social_links binding", () => {
  const node: BuilderNode = {
    id: "soc-2",
    kind: "social_links",
    props: {
      links: [],
      dataBinding: { sourceKey: "workspace_social_links" },
    },
  };
  const { ok } = validateInner(node);
  assert.equal(ok, true);
});

// ── A4 — new data sources registered with field-sets ────────────────────────

test("workspace_social_links / cms_posts / cms_page sources are registered", () => {
  for (const key of [
    "workspace_social_links",
    "cms_posts",
    "cms_page",
  ] as const) {
    const def = getBuilderDataSourceDefinition(key);
    assert.ok(def, `${key} should be registered`);
    assert.ok((def!.fields?.length ?? 0) > 0, `${key} should expose fields`);
  }
  // workspace_social_links exposes the platform + href fields the renderer reads.
  const social = getBuilderDataSourceDefinition("workspace_social_links")!;
  const socialFieldKeys = social.fields!.map((f) => f.key);
  assert.ok(socialFieldKeys.includes("platform"));
  assert.ok(socialFieldKeys.includes("href"));
  // cms_page is promoted to nav-link fields (label + href).
  const page = getBuilderDataSourceDefinition("cms_page")!;
  const pageFieldKeys = page.fields!.map((f) => f.key);
  assert.ok(pageFieldKeys.includes("label"));
  assert.ok(pageFieldKeys.includes("href"));
  // Registry keys stay unique.
  const keys = new Set(BUILDER_DATA_SOURCE_REGISTRY.map((s) => s.key));
  assert.equal(keys.size, BUILDER_DATA_SOURCE_REGISTRY.length);
});

// ── A3 — render: flat nav unchanged; submenu emits a disclosure ─────────────

test("a flat nav renders no submenu markup (byte-stable shape)", () => {
  const html = renderHtml([createNav()]);
  assert.ok(html.includes("site-builder-node--nav"));
  // The CSS stylesheet references the submenu classes, so assert on markup-only
  // signals: a flat nav emits no submenu list element and no popup toggle.
  assert.ok(!html.includes('class="site-builder-node--nav-has-sub"'));
  assert.ok(!html.includes('aria-haspopup="true"'));
});

test("a nav link with children renders a CSS-driven submenu", () => {
  const nav: BuilderNavNode = {
    id: "nav-r",
    kind: "nav",
    props: {
      submenuVariant: "dropdown",
      links: [
        {
          id: "l1",
          label: "Work",
          href: "/work",
          children: [{ id: "c1", label: "Photography", href: "/work/photo" }],
        },
      ],
    },
  };
  const html = renderHtml([nav]);
  assert.ok(html.includes("site-builder-node--nav-has-sub"));
  assert.ok(html.includes("site-builder-node--nav-submenu"));
  assert.ok(html.includes("Photography"));
  assert.ok(html.includes('aria-haspopup="true"'));
});

// ── A4 — render: static links + bound workspace_social_links ────────────────

test("social_links renders static authored links as icon anchors", () => {
  const html = renderHtml([
    {
      id: "soc-r",
      kind: "social_links",
      props: {
        links: [
          { id: "s1", platform: "instagram", href: "https://instagram.com/me" },
        ],
      },
    },
  ]);
  assert.ok(html.includes("site-builder-node--social"));
  assert.ok(html.includes("https://instagram.com/me"));
  assert.ok(html.includes('aria-label="Instagram"'));
});

test("a bound social_links node renders the resolved tenant links (fake source)", () => {
  const node: BuilderNode = {
    id: "soc-bound",
    kind: "social_links",
    props: {
      links: [{ id: "static", platform: "x", href: "https://x.com/ignored" }],
      dataBinding: { sourceKey: "workspace_social_links" },
    },
  };
  const html = renderHtml([node], {
    socialLinks: [
      { platform: "tiktok", href: "https://tiktok.com/@tenant" },
      { platform: "whatsapp", href: "https://wa.me/15551234567" },
    ],
  });
  // Bound data wins over the static link.
  assert.ok(html.includes("https://tiktok.com/@tenant"));
  assert.ok(html.includes("https://wa.me/15551234567"));
  assert.ok(!html.includes("https://x.com/ignored"));
});

test("a bound social_links node with no resolved data falls back to static", () => {
  const node: BuilderNode = {
    id: "soc-fallback",
    kind: "social_links",
    props: {
      links: [{ id: "s1", platform: "facebook", href: "https://facebook.com/me" }],
      dataBinding: { sourceKey: "workspace_social_links" },
    },
  };
  // No socialLinks supplied → fall back to the authored list (never blanks out).
  const html = renderHtml([node], {});
  assert.ok(html.includes("https://facebook.com/me"));
});

// ── A4 follow-up — nav-from-collection autopopulate ─────────────────────────

test("navLinksFromRecords maps records → flat links (label/title fallback, href required)", () => {
  const links = navLinksFromRecords([
    { label: "About", href: "/p/about" },
    // No label → falls back to title.
    { title: "Journal", href: "/posts/journal" },
    // No label/title → falls back to href.
    { href: "/p/contact" },
    // No href → dropped (never a dead <a href>).
    { label: "Ghost" },
  ]);
  assert.deepEqual(links, [
    { id: "bound-0", label: "About", href: "/p/about" },
    { id: "bound-1", label: "Journal", href: "/posts/journal" },
    { id: "bound-2", label: "/p/contact", href: "/p/contact" },
  ]);
});

test("navLinksFromRecords honors maxItems", () => {
  const records = [
    { label: "A", href: "/a" },
    { label: "B", href: "/b" },
    { label: "C", href: "/c" },
  ];
  assert.equal(navLinksFromRecords(records, 2).length, 2);
  // 0 / undefined ⇒ no cap.
  assert.equal(navLinksFromRecords(records, 0).length, 3);
  assert.equal(navLinksFromRecords(records).length, 3);
});

test("a flat nav with no dataBinding renders static links unchanged (byte-stable)", () => {
  const nav = createNav() as BuilderNavNode;
  const a = renderHtml([nav]);
  // Even when cms_page records are present, an UNBOUND nav ignores them.
  const b = renderHtml([nav], {
    collections: { cms_page: [{ label: "Injected", href: "/p/injected" }] },
  });
  assert.equal(a, b);
  assert.ok(!a.includes("/p/injected"));
});

test("a nav bound to cms_page auto-populates its links from the resolved records", () => {
  const nav: BuilderNavNode = {
    id: "nav-bound",
    kind: "nav",
    props: {
      links: [{ id: "static", label: "Fallback", href: "/fallback" }],
      dataBinding: { sourceKey: "cms_page" },
    },
  };
  const html = renderHtml([nav], {
    collections: {
      cms_page: [
        { label: "About", href: "/p/about" },
        { label: "Services", href: "/p/services" },
      ],
    },
  });
  // Bound links win over the static fallback.
  assert.ok(html.includes("/p/about"));
  assert.ok(html.includes("/p/services"));
  assert.ok(html.includes("About"));
  assert.ok(!html.includes("/fallback"));
});

test("a bound nav with no resolved records falls back to its static links", () => {
  const nav: BuilderNavNode = {
    id: "nav-fallback",
    kind: "nav",
    props: {
      links: [{ id: "static", label: "Home", href: "/" }],
      dataBinding: { sourceKey: "cms_posts" },
    },
  };
  // No collections supplied → static links render (never blanks out).
  const html = renderHtml([nav], {});
  assert.ok(html.includes(">Home</a>"));
});

test("nav accepts an optional cms_page / cms_posts dataBinding through validate", () => {
  for (const sourceKey of ["cms_page", "cms_posts"] as const) {
    const node: BuilderNode = {
      id: `nav-${sourceKey}`,
      kind: "nav",
      props: {
        links: [{ id: "l1", label: "Home", href: "/" }],
        dataBinding: { sourceKey },
      },
    };
    const { ok, inner } = validateInner(node);
    assert.equal(ok, true, `${sourceKey} binding should validate`);
    assert.equal(
      (inner as BuilderNavNode).props.dataBinding?.sourceKey,
      sourceKey,
    );
  }
});

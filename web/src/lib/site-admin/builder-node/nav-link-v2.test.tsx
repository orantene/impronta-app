import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { renderBuilderNodes } from "./render";
import type { BuilderNode, BuilderNodeTree } from "./types";
import { validateBuilderNodeTree } from "./validate";

/** A nav is never a ROOT node — the tree validator rejects that — so the
 *  fixture wraps it the way a real header does. */
function navTree(links: unknown, props: Record<string, unknown> = {}): BuilderNodeTree {
  return [
    {
      id: "wrap1",
      kind: "container",
      props: { layout: "row" },
      children: [
        {
          id: "nav1",
          kind: "nav",
          props: { links, ...props },
        },
      ],
    } as unknown as BuilderNode,
  ];
}

/**
 * Markup only. The renderer inlines its whole stylesheet ahead of the nodes,
 * so asserting against the raw output matches CSS SELECTORS as if they were
 * markup — which is how a first draft of this file "passed" a check that the
 * markup did not contain a class the stylesheet merely styles.
 */
function html(tree: BuilderNodeTree, options: Record<string, unknown> = {}): string {
  const raw = renderToStaticMarkup(
    <>{renderBuilderNodes(tree, options as never)}</>,
  );
  return raw.replace(/<style[\s\S]*?<\/style>/g, "");
}

const PRE_V2_LINKS = [
  { id: "l1", label: "Home", href: "/" },
  {
    id: "l2",
    label: "Divisions",
    href: "/directory",
    children: [{ id: "c1", label: "Models", href: "/p/models" }],
  },
];

test("a pre-v2 nav renders its links exactly as before", () => {
  // THE back-compat gate. Every v2 field is optional; a tree that sets none of
  // them must not gain a wrapper span, an icon slot or a description node —
  // those would change spacing on every site that already shipped.
  const out = html(navTree(PRE_V2_LINKS));
  assert.ok(out.includes(">Home</a>"), "a plain link must stay bare text");
  assert.ok(!out.includes("nav-link-text"), "no wrapper span on a plain link");
  assert.ok(!out.includes("nav-link-icon"), "no icon slot on a plain link");
  assert.ok(!out.includes("nav-badge"), "no badge markup on a plain link");
});

test("v2 fields only appear when set", () => {
  const out = html(
    navTree([
      { id: "l1", label: "Book", href: "/p/contact", icon: "calendar", badge: "New" },
    ]),
  );
  assert.match(out, /nav-link-icon/);
  assert.match(out, /nav-badge">New</);
});

test("a description renders in panels but never in the bar", () => {
  // In the top row a description turns a one-line bar into a paragraph.
  const out = html(
    navTree([
      {
        id: "l1",
        label: "Divisions",
        href: "/directory",
        children: [
          { id: "c1", label: "Models", href: "/p/models", description: "Fashion and editorial" },
        ],
      },
    ]),
  );
  const bar = out.slice(0, out.indexOf("nav-disclosure"));
  assert.ok(bar.includes("Fashion and editorial"), "panel links show the description");
  // The description must never sit on a TOP-level bar link.
  const topOnly = html(
    navTree([{ id: "l1", label: "About", href: "/p/about", description: "Who we are" }]),
  );
  assert.ok(!topOnly.includes("Who we are"), "a bar link must not print its description");
});

test("placement chooses the surface", () => {
  const out = html(
    navTree([
      { id: "bar", label: "BarOnly", href: "/a", placement: "bar" },
      { id: "menu", label: "MenuOnly", href: "/b", placement: "menu" },
      { id: "both", label: "Both", href: "/c" },
    ]),
  );
  const split = out.indexOf("nav-disclosure");
  const bar = out.slice(0, split);
  const menu = out.slice(split);
  assert.ok(bar.includes("BarOnly") && !menu.includes("BarOnly"), "bar-only leaked into the menu");
  assert.ok(menu.includes("MenuOnly") && !bar.includes("MenuOnly"), "menu-only leaked into the bar");
  assert.ok(bar.includes("Both") && menu.includes("Both"), "default must render in both");
});

test("hideOn ships the link and lets the breakpoint decide", () => {
  // One server render serves every viewport, so hiding must be a media rule.
  const out = html(navTree([{ id: "l1", label: "Press", href: "/p/press", hideOn: ["mobile"] }]));
  assert.match(out, /data-bn-link-hide="mobile"/);
  assert.ok(out.includes("Press"), "the link must still be in the markup");
});

test("a child with children becomes a group heading", () => {
  const out = html(
    navTree([
      {
        id: "l1",
        label: "Divisions",
        href: "/directory",
        children: [
          {
            id: "g1",
            label: "By discipline",
            href: "#",
            children: [{ id: "gg1", label: "Models", href: "/p/models" }],
          },
        ],
      },
    ]),
  );
  assert.match(out, /nav-group-heading">By discipline</);
  assert.match(out, /nav-group-links/);
});

test("aria-current marks the page you are on, and only when known", () => {
  const withPath = html(navTree(PRE_V2_LINKS), { currentPath: "/directory" });
  assert.match(withPath, /aria-current="page"/);
  const withoutPath = html(navTree(PRE_V2_LINKS));
  assert.ok(
    !withoutPath.includes('aria-current="page"'),
    "no path known must mean no marking, never a guess",
  );
});

test("the v2 shape still validates, and depth stops at three", () => {
  const deep = navTree([
    {
      id: "l1",
      label: "A",
      href: "/a",
      icon: "star",
      children: [
        {
          id: "c1",
          label: "B",
          href: "/b",
          children: [
            {
              id: "g1",
              label: "C",
              href: "/c",
              // A fourth level must be stripped, not rejected.
              children: [{ id: "x1", label: "D", href: "/d" }],
            },
          ],
        },
      ],
    },
  ]);
  const result = validateBuilderNodeTree(deep);
  if (!result.ok) {
    assert.fail(`v2 tree must validate: ${JSON.stringify(result.issues)}`);
    return;
  }
  const raw = JSON.stringify(result.tree);
  assert.ok(!raw.includes('"label":"D"'), "the fourth level should be stripped");
});

test("a featured card renders in the bar's mega panel only", () => {
  // The phone drawer is a list; an image tile there costs a screenful of
  // scrolling for one destination.
  const tree = navTree(
    [
      {
        id: "l1",
        label: "Divisions",
        href: "/directory",
        children: [{ id: "c1", label: "Models", href: "/p/models" }],
        featured: {
          title: "Faces of Fall",
          description: "This season's board",
          href: "/p/faces-of-fall-26",
          imageSrc: "/img/fall.jpg",
        },
      },
    ],
    { submenuVariant: "mega", megaColumns: 3, megaWidth: "full" },
  );
  const out = html(tree);
  const split = out.indexOf("nav-disclosure");
  const bar = out.slice(0, split);
  const menu = out.slice(split);
  assert.match(bar, /nav-featured/);
  assert.match(bar, /Faces of Fall/);
  assert.ok(!menu.includes("nav-featured"), "the drawer must not carry the promo card");
  assert.match(bar, /data-bn-mega-width="full"/);
  assert.match(out, /--bn-mega-cols:3/);
});

test("a dropdown nav gets no mega attributes at all", () => {
  const out = html(
    navTree([
      {
        id: "l1",
        label: "Divisions",
        href: "/directory",
        children: [{ id: "c1", label: "Models", href: "/p/models" }],
        featured: { title: "Promo", href: "/x" },
      },
    ]),
  );
  assert.ok(!out.includes("data-bn-mega-width"), "mega width leaked onto a dropdown");
  assert.ok(!out.includes("nav-featured"), "a dropdown must not render a promo card");
});

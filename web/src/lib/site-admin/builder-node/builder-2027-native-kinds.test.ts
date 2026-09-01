/**
 * builder-2027-native-kinds.test.ts — BUILDER 2027 · P2A.
 *
 * WHAT THIS ASSERTS, AND WHY IT IS SHAPED THIS WAY
 * ───────────────────────────────────────────────
 * Six features in this repo shipped completely dead behind green suites. In
 * every case the pure functions were right and the WIRING to a human was
 * missing: a kind that compiled but had no insert card, a renderer branch that
 * ran but emitted nothing selectable, an inspector control writing a prop the
 * schema then stripped. A suite that only proves `createBuilderNode` returns an
 * object reproduces that failure exactly.
 *
 * So every kind here is driven through the WHOLE chain a human touches:
 *
 *   INSERT  — a real Add Gallery card exists for it, `createBuilderNode` makes
 *             a node, and the drop policy actually admits it somewhere.
 *   RENDER  — the seeded node goes through the REAL `renderBuilderNodes` and
 *             the resulting HTML is non-empty, carries `data-builder-node-id`
 *             (without which the block cannot be selected on the canvas), and
 *             carries the kind's own CSS class (without which every style rule
 *             for it is dead).
 *   PUBLISH — the seeded node survives `validateBuilderNodeTree` byte-for-byte,
 *             which is the gate a publish runs. A prop the schema strips is a
 *             control that silently does nothing on the live site.
 *
 * Plus the four wiring checks that have each caused a real outage here: the
 * scoped stylesheet must still contain the kind's rules, the inspector must
 * exist and write only props the schema accepts, empty/absent data must render
 * something rather than nothing, and the `reveal` primitive must not be able to
 * hide content when its script never runs.
 *
 * Runner: `tsx --test`, reached by `test:builder-node-bindings` (every
 * `*.test.ts` under this directory), so this file cannot be orphaned from CI.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ADD_GALLERY_AVAILABLE_ITEMS } from "@/lib/site-admin/add-gallery/registry-catalog";
import {
  BUILDER_2027_INSPECTOR_GROUPS,
  BUILDER_2027_INSPECTOR_KINDS,
  builder2027InspectorProps,
  isBuilder2027InspectorKind,
} from "./builder-2027-fields";
import { localizablePropsForKind } from "@/lib/i18n/builder-i18n-props";

import { createBuilderNode } from "./create";
import { builderNodeKindAllowedAtRoot, canDropBuilderNode } from "./drop-policy";
import { buildHeadingOutlineFromBuilderTree } from "./freeform-heading-outline";
import { resolveLayerDisplayName } from "./freeform-layer-name";
import { BUILDER_NODE_REGISTRY } from "./registry";
import { BUILDER_NODE_RENDERER_CSS, renderBuilderNodes } from "./render";
import {
  buildScopedRendererCss,
  collectPresentNodeKinds,
} from "./renderer-css-scope";
import type { BuilderNode, BuilderNodeKind } from "./types";
import { validateBuilderNodeTree } from "./validate";

/** The twelve kinds this lane owns. */
const P2A_KINDS = [
  "marquee",
  "directory",
  "featured_talent",
  "location_map",
  "header_search",
  "header_account",
  "header_inquiry",
  "header_language",
  "sticky_scroll",
  "reveal",
  "stats",
  "before_after",
] as const satisfies ReadonlyArray<BuilderNodeKind>;

/** Kinds that are shell chrome, so deliberately NOT droppable at a page root. */
const SHELL_ONLY_KINDS = new Set<BuilderNodeKind>([
  "header_search",
  "header_account",
  "header_inquiry",
  "header_language",
]);

/** The `.site-builder-node--<token>` class each kind stamps on its own root. */
const ROOT_CSS_TOKEN: Readonly<Record<(typeof P2A_KINDS)[number], string>> = {
  marquee: "marquee",
  directory: "directory",
  featured_talent: "featured-talent",
  location_map: "location-map",
  header_search: "header-search",
  header_account: "header-account",
  header_inquiry: "header-inquiry",
  header_language: "header-language",
  sticky_scroll: "sticky-scroll",
  reveal: "reveal",
  stats: "stats",
  before_after: "before-after",
};

/**
 * The selector the scoped sheet MUST still contain for each kind.
 *
 * Three of the four header widgets carry no rule of their own: their entire
 * appearance comes from the shared `--header-widget` chrome, which is exactly
 * why `collectPresentNodeKinds` has to pull `header_search` in for them.
 * Asserting a `--header-account{` rule that was never written would be a test
 * measuring nothing.
 */
const REQUIRED_SCOPED_SELECTOR: Readonly<
  Record<(typeof P2A_KINDS)[number], string>
> = {
  marquee: ".site-builder-node--marquee-track{",
  directory: ".site-builder-node--directory-grid{",
  featured_talent: ".site-builder-node--featured-talent-grid{",
  location_map: ".site-builder-node--location-map-frame{",
  header_search: ".site-builder-node--header-search-input{",
  header_account: ".site-builder-node--header-widget{",
  header_inquiry: ".site-builder-node--header-widget-badge{",
  header_language: ".site-builder-node--header-language-row{",
  sticky_scroll: ".site-builder-node--sticky-scroll-grid{",
  reveal: ".site-builder-node--reveal{",
  stats: ".site-builder-node--stats-grid{",
  before_after: ".site-builder-node--before-after-frame{",
};

/**
 * Render MARKUP ONLY. `includeRendererStyles` is off deliberately: the sheet
 * mentions every class and data-attribute these assertions look for, so leaving
 * it in would let a test pass on the STYLESHEET while the node rendered nothing
 * — a green assertion measuring the wrong string. The sheet is asserted
 * separately, against `BUILDER_NODE_RENDERER_CSS` directly.
 */
function render(
  nodes: BuilderNode[],
  options: Parameters<typeof renderBuilderNodes>[1] = {},
): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      ...options,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

/**
 * Wrap a node so the validator sees it in a legal position. The four header
 * widgets are shell chrome and are deliberately not root-droppable, so a
 * root-level publish of one is correctly rejected.
 */
function publishable(node: BuilderNode): BuilderNode[] {
  if (!SHELL_ONLY_KINDS.has(node.kind)) return [node];
  return [
    {
      id: `wrap-${node.id}`,
      kind: "container",
      props: { layout: "row" },
      children: [node],
    } as BuilderNode,
  ];
}

/** The node the validator returned for `node`, unwrapping the shell wrapper. */
function publishedNode(
  tree: ReadonlyArray<BuilderNode>,
  original: BuilderNode,
): BuilderNode {
  if (!SHELL_ONLY_KINDS.has(original.kind)) return tree[0];
  return (tree[0] as { children: BuilderNode[] }).children[0];
}

// ─── INSERT ──────────────────────────────────────────────────────────────────

test("every P2A kind is registered with a label, description and children policy", () => {
  for (const kind of P2A_KINDS) {
    const entry = BUILDER_NODE_REGISTRY[kind];
    assert.ok(entry, `${kind} is missing from BUILDER_NODE_REGISTRY`);
    assert.equal(entry.kind, kind);
    assert.ok(entry.label.length > 0, `${kind} has no label`);
    assert.ok(
      entry.description.length > 0,
      `${kind} has no description, so its gallery card would read as a blank tile`,
    );
    // `reveal` is the only wrapper; the other eleven are structural leaves.
    assert.equal(
      entry.children.type === "none",
      kind !== "reveal",
      `${kind} has the wrong children policy`,
    );
  }
});

test("every P2A kind has an Add Gallery card that inserts the NATIVE kind", () => {
  for (const kind of P2A_KINDS) {
    const card = ADD_GALLERY_AVAILABLE_ITEMS.find(
      (item) => item.insertMethod === "nativeNode" && item.nativeKind === kind,
    );
    assert.ok(
      card,
      `${kind} has no nativeNode gallery card, so nobody can insert it — the exact ` +
        `shape of a feature that ships dead behind a green suite`,
    );
    assert.equal(card.availability, "available");
    assert.ok(card.label.length > 0);
    assert.ok(
      (card.searchTerms ?? []).length > 0,
      `${kind}'s card is unfindable: no search terms`,
    );
  }
});

test("createBuilderNode seeds every P2A kind with a usable node", () => {
  for (const kind of P2A_KINDS) {
    const node = createBuilderNode(kind);
    assert.equal(node.kind, kind);
    assert.ok(
      node.id.startsWith(`builder-${kind}-`),
      `${kind} id should be namespaced (got ${node.id})`,
    );
    assert.ok(
      Object.keys(node.props as Record<string, unknown>).length > 0,
      `${kind} seeds with empty props, so an operator drops an invisible block`,
    );
  }
});

test("P2A page bands drop at the root; the four shell widgets deliberately do not", () => {
  for (const kind of P2A_KINDS) {
    const allowed = builderNodeKindAllowedAtRoot(kind);
    assert.equal(
      allowed,
      !SHELL_ONLY_KINDS.has(kind),
      `${kind} root-drop policy is wrong`,
    );
  }
  // Every one of the twelve, shell widgets included, must be droppable inside a
  // layout shell — otherwise a header widget could never be placed at all.
  for (const kind of P2A_KINDS) {
    const decision = canDropBuilderNode({
      nodeKind: kind,
      parentKind: "container",
    });
    assert.equal(
      decision.ok,
      true,
      `${kind} cannot be dropped into a container: ${
        decision.ok ? "" : decision.message
      }`,
    );
  }
});

test("reveal accepts children, so it can actually wrap something", () => {
  const decision = canDropBuilderNode({
    nodeKind: "heading",
    parentKind: "reveal",
  });
  assert.equal(decision.ok, true);
});

// ─── RENDER ──────────────────────────────────────────────────────────────────

test("every P2A kind renders selectable, class-carrying markup from its seed", () => {
  for (const kind of P2A_KINDS) {
    const node = createBuilderNode(kind);
    const html = render([node]);
    assert.ok(
      html.length > 0,
      `${kind} rendered NOTHING from its own seed — a dead block on the canvas`,
    );
    assert.ok(
      html.includes(`data-builder-node-id="${node.id}"`),
      `${kind} rendered without data-builder-node-id, so it cannot be selected, ` +
        `moved, or inspected on the canvas`,
    );
    assert.ok(
      html.includes(`data-builder-node-kind="${kind}"`),
      `${kind} rendered without its kind attribute`,
    );
    assert.ok(
      html.includes(`site-builder-node--${ROOT_CSS_TOKEN[kind]}`),
      `${kind} rendered without its own CSS class, so every style rule for it is dead`,
    );
  }
});

test("every P2A kind renders SOMETHING with no data sources and no props", () => {
  // The canvas and a tenant-less preview both render with `dataSources: {}`. A
  // kind that blanks out there reads to an operator as a broken editor.
  for (const kind of P2A_KINDS) {
    const bare = { id: `${kind}-bare`, kind, props: {} } as BuilderNode;
    const node =
      kind === "reveal"
        ? ({ ...bare, children: [] } as BuilderNode)
        : bare;
    const html = render([node], { dataSources: {} });
    assert.ok(
      html.includes(`data-builder-node-id="${kind}-bare"`),
      `${kind} disappeared when given no props and no data`,
    );
  }
});

test("the directory renders a REAL submitting search form, not a picture of one", () => {
  const node = createBuilderNode("directory");
  const html = render([node], { publicPathPrefix: "/x" });
  assert.ok(html.includes('method="get"'), "the filter form does not submit");
  assert.ok(html.includes('action="/x/directory"'), "the form posts nowhere useful");
  assert.ok(html.includes('name="q"'), "the form carries no query field");
  // With no roster resolved it must still say so rather than render a void.
  assert.ok(html.includes("site-builder-node--directory-empty"));
});

test("the directory renders live cards + chips when the server resolved them", () => {
  const node = createBuilderNode("directory");
  const html = render([node], {
    dataSources: {
      directoryProfiles: [
        { id: "t1", name: "Ada", profileCode: "ada" },
      ] as never,
      directoryShortcuts: [{ id: "s1", slug: "models", name: "Models" }],
    },
  });
  assert.ok(
    html.includes('data-builder-live-data-grid="directory_profiles"'),
    "resolved roster cards were not rendered",
  );
  assert.ok(
    html.includes('data-builder-live-data-grid="directory_shortcuts"'),
    "resolved category chips were not rendered",
  );
  assert.ok(!html.includes("site-builder-node--directory-empty"));
});

test("featured talent and location map read their already-resolved data sources", () => {
  const featured = render([createBuilderNode("featured_talent")], {
    dataSources: {
      featuredTalentProfiles: [
        { id: "t1", name: "Ada", profileCode: "ada" },
      ] as never,
    },
  });
  assert.ok(
    featured.includes('data-builder-live-data-grid="featured_talent_profiles"'),
  );

  const map = render([createBuilderNode("location_map")], {
    dataSources: {
      talentLocations: [
        { id: "l1", citySlug: "milan", displayName: "Milan", talentCount: 7 },
      ],
    },
  });
  assert.ok(map.includes('data-builder-live-data-grid="talent_locations"'));
  assert.ok(map.includes("Milan"));
  assert.ok(map.includes("site-builder-node--location-map-pin"));
});

test("the header widgets render working links, never a dead chip", () => {
  const search = render([createBuilderNode("header_search")], {
    publicPathPrefix: "/x",
  });
  assert.ok(search.includes('href="/x/directory"'));

  const account = render([createBuilderNode("header_account")], {
    publicPathPrefix: "/x",
  });
  // `/login` is a PLATFORM auth route, so `prefixPublicHref` deliberately leaves
  // it un-prefixed: a tenant page cannot live at /impronta/login. Asserting the
  // prefixed form here would pin the exact bug #6C fixed.
  assert.ok(
    account.includes('href="/login"'),
    "a signed-out account widget must offer a real sign-in link",
  );

  const inquiry = render([createBuilderNode("header_inquiry")], {
    dataSources: { headerWidgets: { inquiry: { count: 3, href: "/inquiry" } } },
  });
  assert.ok(inquiry.includes("site-builder-node--header-widget-badge"));
  assert.ok(inquiry.includes(">3<"));
});

test("the language switcher hides on a real one-locale signal but never on the canvas", () => {
  const node = createBuilderNode("header_language");
  const oneLocale = render([node], {
    availableLocales: [{ code: "en", href: "/", current: true }],
  });
  assert.equal(
    oneLocale,
    "",
    "a one-language site must not get a switch that does nothing",
  );

  const twoLocales = render([node], {
    availableLocales: [
      { code: "en", href: "/", current: true },
      { code: "es", href: "/es" },
    ],
  });
  assert.ok(twoLocales.includes('href="/es"'));
  assert.ok(twoLocales.includes(">ES<"));

  // No shell context at all is the EDITOR CANVAS, not a one-language site.
  const canvas = render([node]);
  assert.ok(
    canvas.includes(`data-builder-node-id="${node.id}"`),
    "the language widget vanished on the canvas, where it must stay selectable",
  );
});

test("reveal keeps its children visible and ships its own arming script", () => {
  const node = {
    ...createBuilderNode("reveal"),
    children: [{ id: "h1", kind: "heading", props: { text: "Hi", level: 2 } }],
  } as BuilderNode;
  const html = render([node]);
  assert.ok(html.includes("Hi"), "reveal swallowed its children");
  assert.ok(
    html.includes("data-bn-reveal-effect"),
    "reveal did not stamp its effect attribute",
  );
  // The FAILURE THIS GUARDS: the previous revealOnView hid content in CSS and
  // armed it from a runtime the published page never injected. The hidden start
  // state must be gated behind an attribute the node's OWN script sets, and the
  // server must never emit that attribute.
  assert.ok(
    !html.includes('data-bn-reveal-armed="1"'),
    "reveal armed itself on the server, so a page without JavaScript renders blank",
  );
  assert.ok(
    html.includes("IntersectionObserver"),
    "reveal shipped no arming script, so it would never animate",
  );
  assert.ok(
    BUILDER_NODE_RENDERER_CSS.includes(
      '.site-builder-node--reveal[data-bn-reveal-armed="1"]',
    ),
    "the reveal hidden state is not gated on the armed attribute",
  );
});

test("stats renders the FINAL number server-side and only then animates to it", () => {
  const node = createBuilderNode("stats");
  const html = render([node]);
  assert.ok(html.includes(">120<"), "the real figure is not in the HTML");
  assert.ok(html.includes('data-bn-stat-to="120"'));
  assert.ok(html.includes("requestAnimationFrame"));

  const noAnimation = render([
    { ...node, props: { ...node.props, animate: false } } as BuilderNode,
  ]);
  assert.ok(noAnimation.includes(">120<"));
  assert.ok(!noAnimation.includes("requestAnimationFrame"));
});

test("before/after ships a keyboard-operable range control", () => {
  const html = render([createBuilderNode("before_after")]);
  assert.ok(html.includes('type="range"'));
  assert.ok(html.includes('aria-label="Reveal slider"'));
  assert.ok(html.includes("--bn-ba-pos:50%"));
});

test("marquee doubles its track and hides the duplicate from screen readers", () => {
  const html = render([createBuilderNode("marquee")]);
  const runs = html.split("site-builder-node--marquee-run").length - 1;
  assert.equal(runs, 2, "the loop needs exactly one duplicated run to wrap seamlessly");
  assert.ok(
    html.includes('aria-hidden="true"'),
    "the duplicated run must be hidden, or a screen reader reads every item twice",
  );
});

// ─── PUBLISH ─────────────────────────────────────────────────────────────────

test("every P2A seed survives the publish validator with its props intact", () => {
  for (const kind of P2A_KINDS) {
    const node = createBuilderNode(kind);
    const result = validateBuilderNodeTree(publishable(node));
    assert.equal(
      result.ok,
      true,
      `${kind} fails validation, so it can never be published: ${JSON.stringify(
        result.ok ? [] : result.issues,
      )}`,
    );
    assert.equal(result.tree.length, 1);
    assert.deepEqual(
      publishedNode(result.tree, node).props,
      node.props,
      `${kind} lost props at the publish gate — a control that silently does ` +
        `nothing on the live site`,
    );
  }
});

test("a published P2A node renders identically to its draft", () => {
  for (const kind of P2A_KINDS) {
    const node = createBuilderNode(kind);
    const validated = validateBuilderNodeTree(publishable(node));
    assert.equal(validated.ok, true);
    assert.equal(
      render([publishedNode(validated.tree, node)]),
      render([node]),
      `${kind} renders differently after publish validation`,
    );
  }
});

test("the map embed URL allow-list survives publish and rejects a foreign host", () => {
  const good = validateBuilderNodeTree([
    {
      id: "m1",
      kind: "location_map",
      props: {
        mapStyle: "embed",
        mapEmbedUrl: "https://www.google.com/maps/embed?pb=1",
      },
    },
  ]);
  assert.equal(good.ok, true);
  assert.equal(
    (good.tree[0].props as Record<string, unknown>).mapEmbedUrl,
    "https://www.google.com/maps/embed?pb=1",
  );

  const bad = validateBuilderNodeTree([
    {
      id: "m2",
      kind: "location_map",
      props: {
        mapStyle: "embed",
        mapEmbedUrl: "https://evil.example.com/frame",
      },
    },
  ]);
  // The URL must not survive: an iframe src is a security boundary, so a
  // foreign host has to be stripped rather than published.
  assert.notEqual(
    (bad.tree[0]?.props as Record<string, unknown> | undefined)?.mapEmbedUrl,
    "https://evil.example.com/frame",
  );
});

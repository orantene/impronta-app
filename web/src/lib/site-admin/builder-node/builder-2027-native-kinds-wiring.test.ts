/**
 * builder-2027-native-kinds-wiring.test.ts — BUILDER 2027 · P2A, part 2.
 *
 * The INSERT / RENDER / PUBLISH chain for the twelve native kinds lives in
 * `builder-2027-native-kinds.test.ts`; this file carries the four WIRING checks
 * that have each caused a real outage in this repo and that fail INDEPENDENTLY
 * of whether a node renders at all:
 *
 *   - the scoped stylesheet still contains the kind's rules (a kind that
 *     publishes unstyled renders perfectly in a unit test);
 *   - the inspector exists and every control writes a prop the publish schema
 *     accepts (a control writing a prop the schema strips does nothing, with
 *     every test green);
 *   - the navigator names each band by its own content, and the heading outline
 *     sees the h2 each band renders (a missing outline row makes the a11y lint
 *     report a gap on a page whose headings are perfectly nested);
 *   - the render is a pure function of node + options, which is the observable
 *     contract the Phase 1D memo boundary has to preserve.
 *
 * Split from part 1 for the 800-line file cap, not by concern boundary alone.
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

// ─── SCOPED STYLESHEET ───────────────────────────────────────────────────────

test("the scoped renderer sheet keeps each P2A kind's rules and drops them otherwise", () => {
  for (const kind of P2A_KINDS) {
    const present = collectPresentNodeKinds([createBuilderNode(kind)]);
    const scoped = buildScopedRendererCss(BUILDER_NODE_RENDERER_CSS, present);
    assert.ok(
      scoped.includes(REQUIRED_SCOPED_SELECTOR[kind]),
      `${kind}'s rules were dropped from the scoped sheet, so it publishes unstyled`,
    );
  }

  // And the converse: a page of plain headings must not carry them.
  const heading = collectPresentNodeKinds([
    { id: "h", kind: "heading", props: { text: "Hi", level: 2 } } as BuilderNode,
  ]);
  const lean = buildScopedRendererCss(BUILDER_NODE_RENDERER_CSS, heading);
  assert.ok(
    !lean.includes(".site-builder-node--before-after-frame{"),
    "kind-specific rules are shipping on pages that do not use the kind",
  );
});

test("a header widget drags in the shared header-widget chrome", () => {
  // Every `header-widget-*` token maps to `header_search`; without the carve-out
  // in collectPresentNodeKinds a shell with only an account widget would publish
  // with none of the shared chrome rules.
  for (const kind of [
    "header_account",
    "header_inquiry",
    "header_language",
  ] as const) {
    const present = collectPresentNodeKinds([createBuilderNode(kind)]);
    const scoped = buildScopedRendererCss(BUILDER_NODE_RENDERER_CSS, present);
    assert.ok(
      scoped.includes(".site-builder-node--header-widget{"),
      `${kind} publishes without the shared header-widget rules`,
    );
  }
});

// ─── INSPECTOR ───────────────────────────────────────────────────────────────

test("every P2A kind has an inspector with at least one group and one control", () => {
  for (const kind of P2A_KINDS) {
    assert.ok(
      isBuilder2027InspectorKind(kind),
      `${kind} has no Content-tab inspector, so its props are uneditable`,
    );
    const groups = BUILDER_2027_INSPECTOR_GROUPS[kind];
    assert.ok(groups.length > 0, `${kind} has an empty inspector`);
    for (const group of groups) {
      assert.ok(group.title.length > 0);
      assert.ok(group.fields.length > 0, `${kind}/${group.title} has no controls`);
    }
  }
  assert.deepEqual(
    [...BUILDER_2027_INSPECTOR_KINDS].sort(),
    [...P2A_KINDS].sort(),
    "the inspector kind list drifted from the kinds this lane owns",
  );
});

test("every inspector control writes a prop the registry schema actually accepts", () => {
  // THE failure mode this catches: a control that writes `columns` while the
  // schema calls it `columnsDesktop`. The write is accepted by the UI, stripped
  // by validate, and the field "does nothing" with every test still green.
  for (const kind of BUILDER_2027_INSPECTOR_KINDS) {
    const seed = createBuilderNode(kind);
    for (const group of BUILDER_2027_INSPECTOR_GROUPS[kind]) {
      for (const field of group.fields) {
        // A few text fields are VALIDATED, not free text (the map embed URL is an
        // iframe src, so its host allow-list is a security boundary). A generic
        // "probe" string is correctly rejected there, so those get a valid probe
        // rather than a relaxed schema.
        const VALIDATED_PROBE: Record<string, string> = {
          mapEmbedUrl: "https://www.google.com/maps/embed?pb=1",
          // A single glyph between locale links; the schema caps it at 4 chars
          // on purpose, so a five-letter probe is correctly rejected.
          separator: "/",
        };
        const probe =
          field.control === "toggle"
            ? true
            : field.control === "number"
              ? field.fallback
              : field.control === "select"
                ? field.options[0].value
                : (VALIDATED_PROBE[field.prop] ?? "probe");
        const candidate = {
          ...seed,
          props: { ...(seed.props as Record<string, unknown>), [field.prop]: probe },
        } as BuilderNode;
        const result = validateBuilderNodeTree(publishable(candidate));
        assert.equal(
          result.ok,
          true,
          `${kind}.${field.prop} was rejected by the schema`,
        );
        assert.deepEqual(
          (publishedNode(result.tree, candidate).props as Record<string, unknown>)[
            field.prop
          ],
          probe,
          `${kind}.${field.prop} is written by the inspector but stripped at the ` +
            `publish gate, so the control silently does nothing`,
        );
      }
    }
  }
});

test("every inspector field marked localizable is registered as a localizable prop", () => {
  // A field that offers per-locale tabs but is not in LOCALIZABLE_PROPS_BY_KIND
  // stores the translation and then never renders it — the shape of the bug
  // that shipped the Spanish contact form in English.
  for (const kind of BUILDER_2027_INSPECTOR_KINDS) {
    const registered = new Set(localizablePropsForKind(kind));
    for (const group of BUILDER_2027_INSPECTOR_GROUPS[kind]) {
      for (const field of group.fields) {
        if (field.control !== "text" || !field.localizable) continue;
        assert.ok(
          registered.has(field.prop),
          `${kind}.${field.prop} offers a translation tab but the renderer would ` +
            `never read the stored translation`,
        );
      }
    }
  }
});

test("no inspector declares a control twice for the same prop", () => {
  for (const kind of BUILDER_2027_INSPECTOR_KINDS) {
    const props = builder2027InspectorProps(kind);
    assert.equal(
      new Set(props).size,
      props.length,
      `${kind} has duplicate controls; React would warn on the duplicate key and ` +
        `one of the two would never receive the operator's edit`,
    );
  }
});

// ─── NAVIGATOR + A11Y ────────────────────────────────────────────────────────

test("the navigator names a P2A band by its own content, not the kind label", () => {
  const directory = {
    ...createBuilderNode("directory"),
    props: { ...createBuilderNode("directory").props, headline: "Our Chefs" },
  } as BuilderNode;
  assert.equal(resolveLayerDisplayName(directory), "Our Chefs");

  const marquee = createBuilderNode("marquee");
  assert.equal(resolveLayerDisplayName(marquee), "Represented worldwide");

  const widget = createBuilderNode("header_language");
  assert.equal(resolveLayerDisplayName(widget), "Language");

  const reveal = {
    ...createBuilderNode("reveal"),
    children: [{ id: "h", kind: "heading", props: { text: "Our work", level: 2 } }],
  } as BuilderNode;
  assert.equal(resolveLayerDisplayName(reveal), "Reveal · Our work");

  // A band with no content of its own falls back to the registry label rather
  // than to an empty row.
  const empty = { id: "s", kind: "stats", props: {} } as BuilderNode;
  assert.equal(resolveLayerDisplayName(empty), BUILDER_NODE_REGISTRY.stats.label);
});

test("P2A headings reach the outline, so the a11y lint sees the real structure", () => {
  const outline = buildHeadingOutlineFromBuilderTree([
    {
      ...createBuilderNode("directory"),
      props: { ...createBuilderNode("directory").props, headline: "The roster" },
    } as BuilderNode,
    createBuilderNode("sticky_scroll"),
  ]);
  const rows = outline.map((row) => `${row.level}:${row.text}`);
  assert.ok(
    rows.includes("2:The roster"),
    "the directory's h2 is invisible to the outline, so the lint would report a gap " +
      "on a page whose headings are perfectly nested",
  );
  assert.ok(rows.includes("2:How it works"));
  assert.ok(
    rows.includes("3:Tell us the brief"),
    "sticky-scroll block titles render as h3 but are missing from the outline",
  );
});

test("a rendered P2A band emits exactly one h2, matching what the outline claims", () => {
  for (const kind of [
    "directory",
    "featured_talent",
    "location_map",
    "sticky_scroll",
  ] as const) {
    const seed = createBuilderNode(kind);
    const props = seed.props as Record<string, unknown>;
    if (typeof props.headline !== "string" || props.headline.length === 0) continue;
    const html = render([seed]);
    const count = html.split("<h2").length - 1;
    assert.equal(
      count,
      1,
      `${kind} rendered ${count} h2 elements; the outline records exactly one`,
    );
  }
});

test("decorative markup is hidden and interactive markup is labelled", () => {
  // The editorial map is a decorative pin field; the city list carries the
  // content. If the pins were exposed a screen reader would read a wall of
  // empty spans.
  const map = render([createBuilderNode("location_map")], {
    dataSources: {
      talentLocations: [
        { id: "l1", citySlug: "milan", displayName: "Milan", talentCount: 7 },
      ],
    },
  });
  assert.ok(
    map.includes("site-builder-node--location-map-canvas") &&
      map.includes('site-builder-node--location-map-canvas" aria-hidden'),
    "the decorative pin field is exposed to screen readers",
  );

  const directory = render([createBuilderNode("directory")]);
  assert.ok(
    directory.includes('role="search"'),
    "the directory filter form is not announced as a search landmark",
  );

  const language = render([createBuilderNode("header_language")], {
    availableLocales: [
      { code: "en", href: "/", current: true },
      { code: "es", href: "/es" },
    ],
  });
  assert.ok(
    language.includes('aria-label="Language"'),
    "the language switcher nav has no accessible name",
  );
});

// ─── MEMOIZATION (Phase 1D) ─────────────────────────────────────────────────

test("a P2A node re-renders byte-identically from the same references", () => {
  // `BuilderNodeView` is memoized on node + options identity. The observable
  // contract that memo has to preserve is that identical input yields identical
  // output; a case that read a mutable module-level value would break it.
  for (const kind of P2A_KINDS) {
    const node = createBuilderNode(kind);
    const options = { mode: "freeform" as const, dataSources: {} };
    assert.equal(
      renderToStaticMarkup(
        renderBuilderNodes([node], options) as Parameters<
          typeof renderToStaticMarkup
        >[0],
      ),
      renderToStaticMarkup(
        renderBuilderNodes([node], options) as Parameters<
          typeof renderToStaticMarkup
        >[0],
      ),
      `${kind} is not a pure function of its node + options`,
    );
  }
});

test("the memo boundary is applied through createElement, not a raw call", () => {
  // Guards the Phase 1D property itself: children must go through the memoized
  // component. A branch that calls `renderBuilderNode(child, options)` directly
  // silently opts that subtree out of memoization with no visible symptom.
  const wrapper = {
    ...createBuilderNode("reveal"),
    children: [{ id: "h", kind: "heading", props: { text: "Hi", level: 2 } }],
  } as BuilderNode;
  const element = renderBuilderNodes([wrapper], { mode: "freeform" });
  assert.ok(element, "renderBuilderNodes returned nothing");
  assert.ok(
    renderToStaticMarkup(
      createElement("div", null, element as never),
    ).includes("Hi"),
    "the reveal wrapper did not render its child through the node view",
  );
});

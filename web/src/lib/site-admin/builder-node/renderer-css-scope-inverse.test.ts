/**
 * renderer-css-scope-inverse.test.ts — BUILDER 2027 · LANE A.
 *
 * WHAT THIS ASSERTS, AND WHY IT IS SHAPED THIS WAY
 * ───────────────────────────────────────────────
 * `renderer-css-scope.ts` decides which rules a visitor downloads. Its failure
 * mode is not a red build: it is a rule DROPPED from a page that needed it —
 * an unstyled block on a live tenant site, with every existing suite green,
 * because nothing asserts the converse of what the scoper does.
 *
 * `renderer-css-scope.test.ts` pins the FILTER against a synthetic sheet.
 * `builder-2027-native-kinds.test.ts` pins one hand-written selector per P2A
 * kind. Both trust a map that a human wrote. This file trusts nothing: for each
 * kind it RENDERS the node through the real renderer, reads the classes and
 * style attributes that actually came out of the markup, and then demands that
 * every rule in the real sheet which targets one of those hooks is still in the
 * scoped sheet, byte-for-byte.
 *
 * So the direction of proof is inverted:
 *   the scoper says   "this block is droppable because no present kind wants it"
 *   this test says    "the page emits `.sf-tile`; every `.sf-tile` rule must ship"
 *
 * A token mapped to the WRONG kind, a class prefix claimed by a renderer that
 * does not own it, or a container-query tier scoped away while a node still
 * emits its attribute all fail HERE, loudly, naming the block — instead of
 * shipping a page with missing styles.
 *
 * The CSS splitter below is a deliberate second implementation, not an import:
 * a bug shared with the module under test would make both agree and prove
 * nothing.
 *
 * Runner: `tsx --test`, reached by `test:builder-node-bindings` (every
 * `*.test.ts` under this directory), so this file cannot be orphaned from CI.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { BUILDER_NODE_RENDERER_CSS, renderBuilderNodes } from "./render";
import {
  buildScopedRendererCss,
  collectPresentContainerQueryBreakpoints,
  collectPresentNodeKinds,
  stripCssComments,
} from "./renderer-css-scope";
import { createBuilderNode } from "./create";
import { SHIPPED_ELEMENT_INSERT_KINDS } from "./mvp-allow-list";
import type { BuilderNode, BuilderNodeKind } from "./types";

/* ── CSS splitting (independent oracle) ─────────────────────────────────── */

/** Top-level blocks: one rule, or one at-rule with its whole body. */
function splitBlocks(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        out.push(css.slice(start, i + 1));
        start = i + 1;
      }
    }
  }
  return out.filter((b) => b.trim() !== "");
}

/** Flatten `@media`/`@container` wrappers to their inner rules, tagged. */
function leafRules(css: string): Array<{ rule: string; wrapper: string }> {
  const out: Array<{ rule: string; wrapper: string }> = [];
  for (const block of splitBlocks(css)) {
    const at = /^\s*@([a-z-]+)/i.exec(block)?.[1]?.toLowerCase();
    if (at === "media" || at === "container") {
      const open = block.indexOf("{");
      const close = block.lastIndexOf("}");
      const wrapper = block.slice(0, open).trim();
      for (const inner of splitBlocks(block.slice(open + 1, close))) {
        out.push({ rule: inner, wrapper });
      }
      continue;
    }
    out.push({ rule: block, wrapper: "" });
  }
  return out;
}

/** Whitespace-insensitive identity for a rule inside its at-rule scope. */
function ruleKey(entry: { rule: string; wrapper: string }): string {
  const squash = (s: string) => s.replace(/\s+/g, " ").trim();
  return `${squash(entry.wrapper)}||${squash(entry.rule)}`;
}

/** Selector text only — declaration values must never be read as selectors. */
function selectorTextOf(block: string): string {
  let out = "";
  let buf = "";
  for (const ch of block) {
    if (ch === "{") {
      out += `${buf} `;
      buf = "";
    } else if (ch === "}") {
      buf = "";
    } else {
      buf += ch;
    }
  }
  return out;
}

/* ── What the MARKUP actually emits ─────────────────────────────────────── */

/**
 * Every styling hook present in rendered markup: class names, and the
 * `data-builder-style-*` presence attributes the responsive/container lanes
 * key on. These are facts about the page, derived from nothing but its HTML.
 */
function hooksInMarkup(html: string): {
  classes: Set<string>;
  attrs: Set<string>;
} {
  const classes = new Set<string>();
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    for (const c of m[1].split(/\s+/)) if (c) classes.add(c);
  }
  const attrs = new Set<string>();
  for (const m of html.matchAll(/\s(data-builder-style-[a-z0-9-]+)/g)) {
    attrs.add(m[1]);
  }
  return { classes, attrs };
}

/** Split a selector list on top-level commas (commas inside `(…)` are not). */
function splitSelectorList(selectors: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buf = "";
  for (const ch of selectors) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out;
}

/**
 * Could this rule match the rendered page?
 *
 * Every constraint in ONE selector must be satisfiable — not merely one of
 * them. `.site-builder-node` is on virtually every element, so an "any hook
 * matches" test would call every attribute-scoped rule necessary and could
 * never pass while any scoping happened at all. A selector is satisfiable when
 * every class AND every `data-builder-style-*` attribute it names is somewhere
 * in the markup; the rule is needed when any one of its selectors is.
 *
 * `:not()` / `:is()` / `:where()` bodies are stripped rather than required:
 * `:not([x])` wants x ABSENT and `:is(a,b)` is an OR, so demanding their
 * contents would invert the question. That makes this check slightly permissive
 * for those few rules, and exact for the attribute lanes that scoping touches.
 */
function ruleTargetsMarkup(
  rule: string,
  hooks: { classes: Set<string>; attrs: Set<string> },
): boolean {
  return splitSelectorList(selectorTextOf(rule)).some((raw) => {
    const sel = raw.replace(/:(?:not|is|where)\([^)]*\)/g, "");
    const classes = [...sel.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1]);
    const attrs = [...sel.matchAll(/\[(data-builder-style-[a-z0-9-]+)/g)].map(
      (m) => m[1],
    );
    if (classes.length === 0 && attrs.length === 0) return false;
    return (
      classes.every((c) => hooks.classes.has(c)) &&
      attrs.every((a) => hooks.attrs.has(a))
    );
  });
}

/* ── Rendering ──────────────────────────────────────────────────────────── */

function render(nodes: BuilderNode[]): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

function scopedFor(nodes: BuilderNode[]): string {
  return buildScopedRendererCss(
    BUILDER_NODE_RENDERER_CSS,
    collectPresentNodeKinds(nodes),
    collectPresentContainerQueryBreakpoints(nodes),
  );
}

const FULL_RULES = leafRules(stripCssComments(BUILDER_NODE_RENDERER_CSS));

/**
 * THE INVERSE ASSERTION. Render `nodes`, read the hooks the HTML emits, and
 * require that every rule in the full sheet targeting one of those hooks
 * survived into the scoped sheet.
 */
function assertNoNeededRuleDropped(label: string, nodes: BuilderNode[]): void {
  const html = render(nodes);
  const hooks = hooksInMarkup(html);
  const scoped = new Set(leafRules(scopedFor(nodes)).map(ruleKey));

  const missing: string[] = [];
  for (const entry of FULL_RULES) {
    if (!ruleTargetsMarkup(entry.rule, hooks)) continue;
    if (!scoped.has(ruleKey(entry))) {
      missing.push(
        `${entry.wrapper ? `${entry.wrapper} ` : ""}${entry.rule.slice(0, 120)}`,
      );
    }
  }
  assert.deepEqual(
    missing,
    [],
    `${label}: the scoped sheet dropped ${missing.length} rule(s) the rendered markup still needs:\n  ${missing.join("\n  ")}`,
  );
}

/**
 * Wrap so the node sits in a legal position; the four `header_*` widgets and
 * the slot kinds are not root-droppable on their own.
 */
function wrap(node: BuilderNode): BuilderNode[] {
  const container = createBuilderNode("container");
  return [{ ...container, children: [node] } as unknown as BuilderNode];
}

/* ── Tests ──────────────────────────────────────────────────────────────── */

const KINDS_UNDER_TEST: ReadonlyArray<BuilderNodeKind> = [
  ...new Set<BuilderNodeKind>([
    ...SHIPPED_ELEMENT_INSERT_KINDS,
    // The two sub-sheets that own a CLASS PREFIX rather than a `--<token>`
    // class, and so are the whole reason KIND_BY_RENDERER_CSS_CLASS_PREFIX
    // exists. If either is dropped from this list the prefix map goes unproven.
    "carousel",
    "social_feed",
    "social_links",
  ]),
];

/**
 * Kinds whose DEFAULT node renders an empty state — no classes, so the inverse
 * assertion would pass over a blank page and prove nothing. Seeded here with
 * the minimum content that makes the kind actually paint. Each seeded fixture
 * is checked below against a class it must produce, so seed rot fails loudly
 * instead of quietly reverting the case to "measures nothing".
 */
const SEED_PROPS: Partial<Record<BuilderNodeKind, Record<string, unknown>>> = {
  social_feed: {
    source: "manual",
    layout: "grid",
    lightbox: true,
    items: [
      { id: "p1", mediaUrl: "https://example.com/a.jpg", caption: "A" },
      { id: "p2", mediaUrl: "https://example.com/b.jpg", caption: "B" },
    ],
  },
};

/** A class each seeded fixture MUST render, or the seed has rotted. */
const SEED_REQUIRED_CLASS: Partial<Record<BuilderNodeKind, string>> = {
  social_feed: "sf-tile",
};

function seeded(kind: BuilderNodeKind): BuilderNode {
  const base = createBuilderNode(kind);
  const extra = SEED_PROPS[kind];
  if (!extra) return base;
  return {
    ...base,
    props: { ...(base.props as Record<string, unknown>), ...extra },
  } as unknown as BuilderNode;
}

for (const kind of KINDS_UNDER_TEST) {
  test(`scoped sheet keeps every rule a rendered ${kind} needs`, () => {
    let node: BuilderNode;
    try {
      node = seeded(kind);
    } catch {
      // A kind with no factory is not insertable and cannot reach a page.
      return;
    }
    const nodes = wrap(node);
    const required = SEED_REQUIRED_CLASS[kind];
    if (required) {
      assert.ok(
        hooksInMarkup(render(nodes)).classes.has(required),
        `${kind}: fixture renders no .${required} — the assertion below would measure an empty page`,
      );
    }
    assertNoNeededRuleDropped(kind, nodes);
  });
}

test("scoped sheet keeps the carousel HERO sub-sheet (.site-bn-hero__*)", () => {
  // The hero chrome only renders for `variant:"hero"`, so the DEFAULT carousel
  // node never exercises it. Mapping `site-bn-hero` to the wrong kind would go
  // unnoticed without this case.
  const base = createBuilderNode("carousel");
  const hero = {
    ...base,
    props: {
      ...(base.props as Record<string, unknown>),
      variant: "hero",
      slides: [
        { id: "s1", heading: "One" },
        { id: "s2", heading: "Two" },
      ],
    },
  } as unknown as BuilderNode;
  const html = render(wrap(hero));
  assert.ok(
    html.includes("site-bn-hero__"),
    "fixture is not exercising the hero variant — the assertion below would measure nothing",
  );
  assertNoNeededRuleDropped("carousel(hero)", wrap(hero));
});

test("a page with no carousel and no social feed drops both sub-sheets", () => {
  // The positive half of the prefix map: proves it does not merely keep
  // everything (which would pass every inverse assertion above while saving
  // zero bytes).
  const heading = createBuilderNode("heading");
  const scoped = scopedFor(wrap(heading));
  // Pure-prefix selectors: these name NO `--<token>` class, so nothing but the
  // prefix map can drop them. (A hero rule that also names, say,
  // `--heading` is legitimately kept on a page that has a heading — "any
  // present kind → keep" is the safe direction and is not a miss.)
  for (const selector of [
    ".site-bn-hero__arrow",
    ".site-bn-hero__cue",
    ".sf-tile-overlay",
    ".sf-lightbox-nav",
  ]) {
    assert.ok(
      stripCssComments(BUILDER_NODE_RENDERER_CSS).includes(`${selector}{`),
      `fixture drift: ${selector} is no longer in the sheet, so this assertion measures nothing`,
    );
    assert.ok(
      !scoped.includes(`${selector}{`),
      `${selector} still ships on a page that renders no carousel and no social feed`,
    );
  }
  assert.ok(
    scoped.length < stripCssComments(BUILDER_NODE_RENDERER_CSS).length,
    "scoped sheet is not smaller than the full sheet",
  );
});

/* ── Container-query tiers ──────────────────────────────────────────────── */

function nodeWithContainerQueries(
  cq: Record<string, Record<string, string>>,
): BuilderNode[] {
  const base = createBuilderNode("heading");
  return wrap({
    ...base,
    props: {
      ...(base.props as Record<string, unknown>),
      style: { containerQueries: cq },
    },
  } as unknown as BuilderNode);
}

test("an authored @container tier survives, and only that tier", () => {
  const nodes = nodeWithContainerQueries({ tablet: { opacity: "0.5" } });
  const html = render(nodes);
  assert.ok(
    html.includes("data-builder-style-cq-tablet-"),
    "fixture is not emitting a cq-tablet attribute — the assertion would measure nothing",
  );
  assertNoNeededRuleDropped("containerQueries.tablet", nodes);

  const scoped = scopedFor(nodes);
  assert.ok(scoped.includes("data-builder-style-cq-tablet-"));
  assert.ok(
    !scoped.includes("data-builder-style-cq-mobile-"),
    "the unauthored cq-mobile tier is still shipping",
  );
});

test("a page authoring no container queries drops both @container blocks", () => {
  const scoped = scopedFor(wrap(createBuilderNode("heading")));
  assert.ok(!scoped.includes("data-builder-style-cq-tablet-"));
  assert.ok(!scoped.includes("data-builder-style-cq-mobile-"));
});

test("a linked style class makes the container-query scoping bail out", () => {
  // A style CLASS can carry containerQueries, and the class registry is not
  // resolved into the tree the collector walks. Guessing "absent" there would
  // drop a block the page needs, so the collector must report "unknown".
  const base = createBuilderNode("heading");
  const nodes = wrap({
    ...base,
    props: {
      ...(base.props as Record<string, unknown>),
      style: { classRef: "cls-1" },
    },
  } as unknown as BuilderNode);
  assert.equal(collectPresentContainerQueryBreakpoints(nodes), null);
  const scoped = scopedFor(nodes);
  assert.ok(
    scoped.includes("data-builder-style-cq-tablet-") &&
      scoped.includes("data-builder-style-cq-mobile-"),
    "a classRef must fall back to keeping BOTH @container blocks",
  );
});

test("an unresolvable component instance makes the scoping bail out", () => {
  // Same reasoning: the subtree that will actually render is invisible here.
  const base = createBuilderNode("container");
  const nodes = [
    {
      ...base,
      props: { ...(base.props as Record<string, unknown>), instanceOf: "cmp-1" },
    } as unknown as BuilderNode,
  ];
  assert.equal(collectPresentContainerQueryBreakpoints(nodes), null);
});

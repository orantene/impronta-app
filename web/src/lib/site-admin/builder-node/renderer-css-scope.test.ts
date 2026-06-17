import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildScopedRendererCss,
  collectPresentNodeKinds,
} from "./renderer-css-scope";
import type {
  BuilderNode,
  BuilderNodeKind,
} from "./types";
import type { ComponentDefinitions } from "./component-instances";

/**
 * REND-2 unit lock — scope the renderer stylesheet to the node-kinds present.
 *
 * The real `BUILDER_NODE_RENDERER_CSS` lives in render.tsx as a private const;
 * its STRUCTURE (`.site-builder-node--<token>{…}` rule blocks, base rules with
 * no kind token, `@media` wrappers with kind-specific inner rules, `@keyframes`
 * base blocks) is what this filter relies on. These tests use a small synthetic
 * sheet with that exact structure so they pin the FILTER behavior deterministically;
 * render-output / render-perf-budget cover the real sheet end to end through the
 * `<BuilderNodeRendererStyles>` component.
 */

// A miniature sheet mirroring the real one's structure:
//  - a base rule (no kind token) → always kept
//  - per-kind blocks for container / heading / carousel
//  - an @keyframes base block → always kept
//  - an @media wrapper whose inner rules are base + per-kind
const SHEET = [
  ".site-builder-node{box-sizing:border-box}", // BASE
  ".site-builder-node--container{display:flex}", // container
  ".site-builder-node--heading{font-family:inherit}", // heading
  ".site-builder-node--carousel{display:grid}", // carousel
  ".site-builder-node--carousel-slide{flex:0 0 50%}", // carousel (sub-token)
  ".site-builder-node--pricing-tier{border:1px solid}", // pricing_table (sub-token)
  "@keyframes bn-anim-fade-in{from{opacity:0}to{opacity:1}}", // BASE keyframes
  "@media (max-width:640px){.site-builder-node{padding:0}.site-builder-node--carousel{gap:1rem}.site-builder-node--container{align-items:stretch}}",
].join("\n");

function node(kind: BuilderNodeKind, children?: BuilderNode[]): BuilderNode {
  return { id: `${kind}-${Math.random()}`, kind, props: {}, children } as BuilderNode;
}

// ── collectPresentNodeKinds ───────────────────────────────────────────────────

test("collectPresentNodeKinds: walks the whole tree (nested children)", () => {
  const tree: BuilderNode[] = [
    node("container", [node("heading"), node("container", [node("button")])]),
  ];
  const kinds = collectPresentNodeKinds(tree);
  assert.deepEqual(
    [...kinds].sort(),
    ["button", "container", "heading"],
    "every nested kind is collected",
  );
});

test("collectPresentNodeKinds: a directory-search container also implies button", () => {
  const search: BuilderNode = {
    id: "search",
    kind: "container",
    props: { dataBinding: { sourceKey: "tenant_directory_search" } },
    children: [],
  } as unknown as BuilderNode;
  const kinds = collectPresentNodeKinds([search]);
  assert.ok(kinds.has("container"), "container present");
  assert.ok(
    kinds.has("button"),
    "search-shell submit button rules must survive even with no authored button node",
  );
});

test("collectPresentNodeKinds: includes kinds resolved from a living-component instance", () => {
  const componentId = "cmp-1";
  // Master subtree carries a carousel — a kind that exists ONLY inside the
  // saved component, not in the instance node's own children.
  const master: BuilderNode = {
    id: "master",
    kind: "container",
    props: {},
    children: [node("carousel", [node("carousel" as BuilderNodeKind)])],
  } as BuilderNode;
  const components: ComponentDefinitions = { [componentId]: master };

  const instance: BuilderNode = {
    id: "inst",
    kind: "container",
    props: { instanceOf: componentId },
    children: [], // empty stored children — kind only reachable via resolution
  } as unknown as BuilderNode;

  const withComponents = collectPresentNodeKinds([instance], components);
  assert.ok(
    withComponents.has("carousel"),
    "instance-resolved carousel kind must be detected when the definition is loaded",
  );

  // Without the definition map, the instance falls back to its (empty) stored
  // children, so carousel is NOT seen — which is correct, because the published
  // render also falls back to stored children when the definition is missing.
  const withoutComponents = collectPresentNodeKinds([instance]);
  assert.ok(!withoutComponents.has("carousel"));
});

// ── buildScopedRendererCss ────────────────────────────────────────────────────

test("scoped CSS for {container, heading} keeps those + base, drops absent kinds", () => {
  const scoped = buildScopedRendererCss(
    SHEET,
    new Set<BuilderNodeKind>(["container", "heading"]),
  );
  // base + present-kind rules retained
  assert.ok(scoped.includes(".site-builder-node{box-sizing:border-box}"), "base kept");
  assert.ok(scoped.includes(".site-builder-node--container{display:flex}"), "container kept");
  assert.ok(scoped.includes(".site-builder-node--heading{font-family:inherit}"), "heading kept");
  assert.ok(scoped.includes("@keyframes bn-anim-fade-in"), "keyframes (base) kept");
  // absent kinds dropped
  assert.ok(!scoped.includes(".site-builder-node--carousel{"), "carousel dropped");
  assert.ok(!scoped.includes(".site-builder-node--carousel-slide"), "carousel sub-token dropped");
  assert.ok(!scoped.includes(".site-builder-node--pricing-tier"), "pricing dropped");
  // the scoped sheet is materially smaller than the full sheet
  assert.ok(scoped.length < SHEET.length, "scoped sheet is smaller");
});

test("scoped @media wrapper keeps base + present inner rules, drops absent", () => {
  const scoped = buildScopedRendererCss(
    SHEET,
    new Set<BuilderNodeKind>(["container"]),
  );
  // The @media wrapper must survive (it has base + container inner rules) …
  assert.ok(scoped.includes("@media (max-width:640px){"), "media wrapper kept");
  assert.ok(scoped.includes(".site-builder-node{padding:0}"), "media base inner kept");
  assert.ok(
    scoped.includes('.site-builder-node--container{align-items:stretch}'),
    "media container inner kept",
  );
  // … but the carousel inner rule inside the @media is dropped.
  assert.ok(
    !scoped.includes(".site-builder-node--carousel{gap:1rem}"),
    "media carousel inner dropped",
  );
});

test("scoped sheet NEVER omits a selector for a present kind (incl. sub-tokens)", () => {
  // carousel present → its block AND its sub-token block must both survive.
  const scoped = buildScopedRendererCss(
    SHEET,
    new Set<BuilderNodeKind>(["carousel"]),
  );
  assert.ok(scoped.includes(".site-builder-node--carousel{display:grid}"));
  assert.ok(scoped.includes(".site-builder-node--carousel-slide{flex:0 0 50%}"));
  assert.ok(scoped.includes(".site-builder-node--carousel{gap:1rem}"), "media carousel kept");
});

test("empty kind set → FULL sheet (conservative fallback)", () => {
  assert.equal(
    buildScopedRendererCss(SHEET, new Set<BuilderNodeKind>()),
    SHEET,
    "no kinds known → emit the full sheet unchanged",
  );
});

test("undefined / null kinds → FULL sheet (conservative fallback)", () => {
  assert.equal(buildScopedRendererCss(SHEET, undefined), SHEET);
  assert.equal(buildScopedRendererCss(SHEET, null), SHEET);
});

test("a sheet with an UNKNOWN token keeps that block (never drop a needed rule)", () => {
  const sheet = `${SHEET}\n.site-builder-node--brand-new-thing{color:red}`;
  const scoped = buildScopedRendererCss(
    sheet,
    new Set<BuilderNodeKind>(["heading"]),
  );
  assert.ok(
    scoped.includes(".site-builder-node--brand-new-thing{color:red}"),
    "an unrecognised kind-token block is kept (safe direction)",
  );
});

test("an unbalanced sheet → FULL sheet (parse anomaly fallback)", () => {
  const broken = ".site-builder-node--container{display:flex"; // missing }
  assert.equal(
    buildScopedRendererCss(broken, new Set<BuilderNodeKind>(["heading"])),
    broken,
    "unparseable sheet returns unchanged",
  );
});

test("scoped output is a byte-exact superset: each retained block is unchanged", () => {
  const scoped = buildScopedRendererCss(
    SHEET,
    new Set<BuilderNodeKind>(["container"]),
  );
  // The container declaration block must be byte-identical to the source.
  assert.ok(scoped.includes(".site-builder-node--container{display:flex}"));
  // No declaration was rewritten — re-checking the exact base bytes.
  assert.ok(scoped.includes(".site-builder-node{box-sizing:border-box}"));
});

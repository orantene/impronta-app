/**
 * animation-trigger-lanes.test.ts — what each Animation-tab "When it plays"
 * choice actually EMITS on a published page.
 *
 * The four lanes are not variations on one code path, they are three:
 *
 *   load                  -> inline `animation` shorthand. Plays as the page paints.
 *   scroll + every time   -> inline shorthand + `animation-timeline: view()`.
 *                            Playback is tied to scroll position.
 *   scroll + just once    -> NO inline shorthand (it must not play at load).
 *                            The shorthand rides on `--bn-anim` and a
 *                            `[data-bn-anim-once]` hook; the runtime arms the
 *                            node and the sheet plays it when it scrolls in.
 *   hover                 -> same custom-property trick, `[data-bn-anim-trigger]`.
 *
 * The failure this guards is specific and was hit for real during the build: a
 * lane that publishes its attributes correctly while the runtime that acts on
 * them is never injected, so the control looks wired and does nothing. So the
 * runtime assertion is here too, not just the markup.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/lib/site-admin/builder-node/animation-trigger-lanes.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { BuilderNodeRendererStyles, renderBuilderNodes } from "./render";
import type { BuilderNode, BuilderNodeStyle } from "./types";

function render(style: BuilderNodeStyle): string {
  const nodes: BuilderNode[] = [
    {
      id: "h1",
      kind: "heading",
      props: { text: "Hello", level: 2, style },
    } as BuilderNode,
  ];
  // `includeRendererStyles:false` mirrors how every real published route
  // renders blocks (the sheet is hoisted to page level), and keeps the sheet's
  // own text -- which mentions every attribute below -- out of these
  // assertions. The sheet is asserted separately, via `sheet()`.
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

/**
 * The hoisted page-level sheet. `nodes` is what tells it whether the play-once
 * arming runtime is needed; omitting it must stay byte-identical (the reveal
 * back-compat guard and the code-node security guard both depend on that).
 */
const sheet = (nodes?: BuilderNode[]) =>
  renderToStaticMarkup(
    BuilderNodeRendererStyles({ nodes }) as Parameters<
      typeof renderToStaticMarkup
    >[0],
  );

const ONCE_TREE: BuilderNode[] = [
  {
    id: "h1",
    kind: "heading",
    props: {
      text: "Hello",
      level: 2,
      style: {
        animationPreset: "rise",
        animationTrigger: "scroll",
        animationRepeat: "once",
      },
    },
  } as BuilderNode,
];

test("load: the shorthand is inline and plays immediately", () => {
  const html = render({ animationPreset: "zoom-out" });
  assert.match(html, /animation:bn-anim-zoom-out 0\.6s ease 0s both/);
  assert.doesNotMatch(html, /--bn-anim:/);
  assert.doesNotMatch(html, /data-bn-anim-once/);
});

test("scroll + every time: shorthand plus the view() timeline", () => {
  const html = render({
    animationPreset: "rise",
    animationTrigger: "scroll",
  });
  assert.match(html, /animation:bn-anim-rise/);
  assert.match(html, /animation-timeline:view\(\)/);
  assert.doesNotMatch(html, /data-bn-anim-once/);
});

test("scroll + just once: NOTHING plays at load, the once hook is published", () => {
  const html = render({
    animationPreset: "rise",
    animationTrigger: "scroll",
    animationRepeat: "once",
  });
  // The distinction that matters: no inline `animation:` declaration, or the
  // node would animate the instant the page painted -- which is the behaviour
  // the operator just chose NOT to have.
  assert.doesNotMatch(html, /[^-]animation:bn-anim-rise/);
  assert.match(html, /--bn-anim:bn-anim-rise 0\.6s ease 0s both/);
  assert.match(html, /data-bn-anim-once/);
  assert.doesNotMatch(html, /animation-timeline/);
});

test("hover: the shorthand waits on a custom property, keyed by the trigger attr", () => {
  const html = render({
    animationPreset: "bounce-in",
    animationTrigger: "hover",
  });
  assert.doesNotMatch(html, /[^-]animation:bn-anim-bounce-in/);
  assert.match(html, /--bn-anim:bn-anim-bounce-in/);
  assert.match(html, /data-bn-anim-trigger="hover"/);
});

test("distance publishes --bn-anim-distance, and omitting it publishes nothing", () => {
  const withDistance = render({
    animationPreset: "slide-left",
    animationDistance: "120px",
  });
  assert.match(withDistance, /--bn-anim-distance:120px/);

  // Back-compat: a node that never set a distance must render byte-identically
  // to how it did before the control existed. The keyframe's own fallback does
  // the work; no variable is emitted.
  const without = render({ animationPreset: "slide-left" });
  assert.doesNotMatch(without, /--bn-anim-distance/);
});

test("preset 'none' emits no animation at all", () => {
  const html = render({ animationPreset: "none", animationTrigger: "hover" });
  assert.doesNotMatch(html, /bn-anim-/);
  assert.doesNotMatch(html, /data-bn-anim-trigger/);
});

test("no play-once node -> no runtime, byte-identical sheet", () => {
  // Both an existing back-compat guard and the code-node security guard forbid
  // a script appearing in this output when nothing asked for one.
  assert.doesNotMatch(sheet(), /<script/);
  assert.doesNotMatch(sheet([]), /<script/);
});

test("the play-once runtime ships with the sheet, on every page", () => {
  // Not with `renderBuilderNodes`: every real published route hoists the sheet
  // to page level and renders blocks with `includeRendererStyles:false`, so a
  // runtime gated inside the node render is a runtime that never ships. This is
  // the bug that made the older reveal-on-view runtime dead on arrival.
  const html = sheet(ONCE_TREE);
  assert.match(html, /data-builder-node-anim-once-runtime/);
  assert.match(html, /\[data-bn-anim-once\]/);
  // It must wait for the body: the sheet is emitted in head order, so a bare
  // call would query zero nodes and quietly do nothing.
  assert.match(html, /DOMContentLoaded/);
  // And it must bind only once, since the sheet is mounted per shell region.
  assert.match(html, /__bnAnimOnceRuntime/);
});

test("the sheet carries a reduced-motion guard for BOTH non-inline lanes", () => {
  const html = sheet();
  assert.match(
    html,
    /@media \(prefers-reduced-motion:reduce\)\{[^}]*data-bn-anim-trigger=[^}]*data-bn-anim-once[^}]*animation:none!important;opacity:1!important/,
    "Hover and play-once deliver their animation through a custom property, so " +
      "the older [style*=\"animation\"] guard does not see them. They need their " +
      "own reduced-motion rule or reduced motion silently stops applying.",
  );
});

test("the static sheet never hides a play-once node on its own", () => {
  // The hidden pose is injected BY THE RUNTIME, so a no-JS reader and every
  // crawler see the text. Just as important: the runtime arms by appending a
  // stylesheet rather than writing an attribute onto each node -- it runs at
  // DOMContentLoaded, before React hydrates, and an attribute written then is
  // one the server never rendered, which React reports as an unpatchable
  // hydration mismatch on every node in the lane.
  const html = sheet(ONCE_TREE);
  // Only the <style> block -- the runtime <script> in the same output legitimately
  // CONTAINS that rule as the text it injects at arming time.
  const styleBlock = /<style[^>]*data-builder-node-renderer-styles[^>]*>([\s\S]*?)<\/style>/.exec(
    html,
  );
  assert.ok(styleBlock, "renderer stylesheet not found in the output");
  assert.doesNotMatch(
    styleBlock[1]!,
    /\[data-bn-anim-once\][^{]*\{[^}]*opacity:0/,
    "the shipped sheet must not hide play-once nodes; only the runtime may",
  );
  assert.match(html, /data-bn-anim-once-armed/);
  assert.match(html, /createElement\('style'\)/);
  assert.doesNotMatch(
    html,
    /setAttribute\('data-bn-reveal-armed'/,
    "arming must not touch attributes React owns",
  );
});

/**
 * HYDRATION INVARIANT for the reveal lane.
 *
 * Every inline runtime the renderer ships runs at DOMContentLoaded, which fires
 * BEFORE React hydrates. An attribute a runtime writes onto a NODE is therefore
 * one the server never rendered: React reports a hydration mismatch it
 * explicitly "won't patch up", and the arming state can diverge from what the
 * CSS expects. Arming must happen by injecting a <style>, never by writing an
 * attribute onto an element React owns.
 *
 * The assertion keys on the exact node-attribute form — `'data-bn-reveal-armed'`
 * with its closing quote — because the injected stylesheet is legitimately
 * MARKED `data-bn-reveal-armed-sheet`. That rename is what keeps the two cases
 * distinguishable by a static check at all.
 *
 * `data-bn-revealed` is deliberately exempt: it is written from an
 * IntersectionObserver callback, which cannot fire before the observer is
 * constructed, i.e. after hydration.
 */
const REVEAL_TREE: BuilderNode[] = [
  {
    id: "h1",
    kind: "heading",
    props: { text: "Hello", level: 2, style: { revealOnView: "fade-up" } },
  } as BuilderNode,
];

const revealLaneHtml = (): string =>
  renderToStaticMarkup(
    renderBuilderNodes(REVEAL_TREE, {
      mode: "freeform",
      includeRendererStyles: true,
      includeFontLinks: false,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );

test("the reveal lane never arms by writing an attribute React owns", () => {
  assert.doesNotMatch(
    revealLaneHtml(),
    /setAttribute\('data-bn-reveal-armed'/,
    "arming must mark an injected <style>, never a node",
  );
});

test("the reveal lane injects its hidden poses instead of shipping them", () => {
  const html = revealLaneHtml();
  assert.match(html, /data-bn-reveal-armed-sheet/, "style marker present");
  assert.match(html, /createElement\('style'\)/, "poses injected at arm time");

  // With no JS, no IntersectionObserver or reduced motion the node has to
  // render at rest, or the content is permanently invisible to a reader and to
  // a crawler — so no hidden pose may ship in the static sheet.
  const styleBlock =
    /<style[^>]*data-builder-node-renderer-styles[^>]*>([\s\S]*?)<\/style>/.exec(html);
  assert.ok(styleBlock, "renderer stylesheet not found in the output");
  assert.doesNotMatch(
    styleBlock[1]!,
    /\[data-bn-reveal\][^{]*\{[^}]*opacity:0/,
    "the shipped sheet must not hide reveal nodes; only the runtime may",
  );
});


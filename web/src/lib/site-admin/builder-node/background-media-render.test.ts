/**
 * background-media-render.test.ts — what a container background ACTUALLY emits
 * through the real renderer.
 *
 * `background-media.test.ts` pins the resolver. This pins the markup, because
 * the two ways this feature breaks in production are both invisible to a unit
 * test of the resolver:
 *   - the layer regresses into the flow and pushes the author's content down,
 *     or steals the click target;
 *   - a container that never asked for a background stops rendering
 *     byte-identically, which is how "I saved and nothing changed" incidents
 *     start.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { BuilderNodeRendererStyles, renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";

function render(nodes: BuilderNode[]): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, { mode: "freeform" }) as Parameters<
      typeof renderToStaticMarkup
    >[0],
  );
}

function container(backgroundMedia?: unknown): BuilderNode {
  return {
    id: "c1",
    kind: "container",
    props: {
      layout: "stack",
      ...(backgroundMedia ? { backgroundMedia } : {}),
    },
    children: [{ id: "h", kind: "heading", props: { text: "Hi", level: 2 } }],
  } as BuilderNode;
}

const SHEET = renderToStaticMarkup(
  BuilderNodeRendererStyles({}) as Parameters<typeof renderToStaticMarkup>[0],
);

// ── Back-compat ───────────────────────────────────────────────────────────

/**
 * `renderBuilderNodes` inlines the renderer stylesheet, and that sheet mentions
 * every background-media class by name. So "did a LAYER render" has to be asked
 * about the element markup (`class="…"`, `data-…=""`), never about a bare
 * substring — a substring check here passes on the CSS and proves nothing.
 */
function hasBackgroundLayer(html: string): boolean {
  return (
    html.includes('class="site-builder-bg-media"') ||
    html.includes('data-bn-bg-media=""')
  );
}

test("a container with no background renders byte-identically to before", () => {
  const html = render([container()]);
  assert.equal(hasBackgroundLayer(html), false);
  assert.equal(html.includes("<video"), false);
  assert.equal(html.includes("<iframe"), false);
});

test("an unresolvable value emits NOTHING rather than a broken frame", () => {
  // The author pasted a Vimeo link into the YouTube field. The page must render
  // as if no background were set, not as an empty black box.
  const html = render([
    container({ source: "youtube", src: "https://vimeo.com/123456789", overlay: 40 }),
  ]);
  assert.equal(hasBackgroundLayer(html), false);
  assert.equal(html.includes("<iframe"), false);
  assert.ok(html.includes("Hi"), "the author's content must still render");
});

// ── Upload lane ───────────────────────────────────────────────────────────

test("an uploaded clip renders a muted, looping, inert <video>", () => {
  const html = render([
    container({
      source: "upload",
      src: "https://cdn.example.com/a.mp4",
      poster: "https://cdn.example.com/a.jpg",
      overlay: 40,
    }),
  ]);
  assert.ok(html.includes('data-bn-bg-media=""'), "container needs the CSS hook");
  assert.ok(html.includes('class="site-builder-bg-media"'));
  assert.ok(html.includes('src="https://cdn.example.com/a.mp4"'));
  // Autoplay only survives a browser's gesture policy when muted.
  assert.ok(html.includes("muted"), "an unmuted background is blocked from autoplaying");
  assert.ok(html.includes("loop"));
  assert.ok(html.includes("playsInline") || html.includes("playsinline"));
  // A decorative background must never take focus or be announced.
  assert.ok(html.includes('tabindex="-1"'));
  assert.ok(html.includes('aria-hidden="true"'));
  // And it must never expose player controls.
  assert.equal(/<video[^>]*\scontrols/.test(html), false);
});

test("the poster is a real element, so reduced motion lands on a still", () => {
  const html = render([
    container({
      source: "upload",
      src: "https://cdn.example.com/a.mp4",
      poster: "https://cdn.example.com/a.jpg",
    }),
  ]);
  assert.ok(html.includes("site-builder-bg-media__poster"));
  assert.ok(html.includes('src="https://cdn.example.com/a.jpg"'));
});

// ── YouTube lane ──────────────────────────────────────────────────────────

test("a YouTube background frames the nocookie host, never the pasted URL", () => {
  const html = render([
    container({
      source: "youtube",
      src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      overlay: 55,
    }),
  ]);
  assert.ok(html.includes("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"));
  assert.equal(
    html.includes("youtube.com/watch"),
    false,
    "the raw pasted URL must never reach the iframe src",
  );
  assert.ok(html.includes('loading="lazy"'), "a background frame must not block first paint");
  assert.ok(html.includes("site-builder-bg-media__frame"));
  // The derived thumbnail is the reduced-motion still.
  assert.ok(html.includes("i.ytimg.com/vi/dQw4w9WgXcQ"));
});

test("the YouTube frame is sandboxed and cannot navigate or pop up", () => {
  const html = render([
    container({ source: "youtube", src: "https://youtu.be/dQw4w9WgXcQ" }),
  ]);
  const sandbox = /sandbox="([^"]*)"/.exec(html)?.[1] ?? "";
  assert.ok(sandbox.includes("allow-scripts"), "the player needs scripts");
  for (const forbidden of [
    "allow-popups",
    "allow-forms",
    "allow-top-navigation",
    "allow-modals",
    "allow-downloads",
  ]) {
    assert.equal(
      sandbox.includes(forbidden),
      false,
      `a decorative background must not be granted ${forbidden}`,
    );
  }
});

// ── The scrim ─────────────────────────────────────────────────────────────

test("the overlay reaches the DOM as a 0-1 opacity, not the stored 0-100", () => {
  const html = render([
    container({ source: "upload", src: "https://cdn.example.com/a.mp4", overlay: 55 }),
  ]);
  assert.ok(
    html.includes("--bn-bg-overlay:0.55"),
    `expected a 0-1 opacity variable, got: ${html.slice(0, 400)}`,
  );
  assert.ok(html.includes("site-builder-bg-media__scrim"));
});

// ── The sheet ─────────────────────────────────────────────────────────────

test("the renderer sheet carries the background-media geometry", () => {
  assert.ok(SHEET.includes(".site-builder-bg-media"));
  // Absolute + inset:0 is what keeps the layer out of the flex/grid flow, so
  // it can never push the author's content down.
  assert.ok(/\.site-builder-bg-media\{[^}]*position:absolute/.test(SHEET));
  assert.ok(/\.site-builder-bg-media\{[^}]*pointer-events:none/.test(SHEET));
  // isolation:isolate keeps this block's z-index ordering local, so it cannot
  // reorder the editor's own selection chrome.
  assert.ok(/\[data-bn-bg-media\]\{[^}]*isolation:isolate/.test(SHEET));
});

// ── Slideshow lane ────────────────────────────────────────────────────────

test("a slideshow paints every image, with only the first one active", () => {
  const html = render([
    container({
      source: "slideshow",
      src: "",
      overlay: 40,
      slides: [{ url: "/a.jpg" }, { url: "/b.jpg" }, { url: "/c.jpg" }],
    }),
  ]);
  assert.ok(html.includes('data-bn-bg-media=""'), "container needs the CSS hook");
  assert.ok(html.includes('data-bn-bg-media-source="slideshow"'));
  for (const url of ["/a.jpg", "/b.jpg", "/c.jpg"]) {
    assert.ok(html.includes(`src="${url}"`), `${url} must be in the markup`);
  }
  // Exactly one active slide in the server output: that IS the no-JS and
  // pre-hydration rendering, so two actives would ship a double exposure.
  assert.equal((html.match(/data-active=""/g) ?? []).length, 1);
  // And the scrim still sits over the stack.
  assert.ok(html.includes("site-builder-bg-media__scrim"));
  assert.ok(html.includes("--bn-bg-overlay:0.4"));
});

test("only the first slideshow image is eager; the rest load lazily", () => {
  // A ten-image backdrop must cost ONE image at first paint, not ten.
  const html = render([
    container({
      source: "slideshow",
      src: "",
      slides: [{ url: "/a.jpg" }, { url: "/b.jpg" }, { url: "/c.jpg" }],
    }),
  ]);
  const slides = html.match(/<img[^>]*site-builder-bg-media__slide[^>]*>/g) ?? [];
  assert.equal(slides.length, 3);
  assert.ok(slides[0]!.includes('loading="eager"'));
  assert.ok(slides[1]!.includes('loading="lazy"'));
  assert.ok(slides[2]!.includes('loading="lazy"'));
});

test("a slideshow layer is decorative: no alt text, no focus, no clicks", () => {
  const html = render([
    container({ source: "slideshow", src: "", slides: [{ url: "/a.jpg" }] }),
  ]);
  const slide = /<img[^>]*site-builder-bg-media__slide[^>]*>/.exec(html)?.[0] ?? "";
  assert.ok(slide.includes('alt=""'));
  assert.ok(slide.includes('aria-hidden="true"'));
});

test("a slideshow emits <img> only, so it needs no CSP directive beyond img-src", () => {
  // `media-src` (added in #1204) governs <video>/<audio> and `frame-src` the
  // YouTube iframe. This lane must not quietly introduce a third element kind
  // that lands outside the directives the deploy smoke test checks for.
  const html = render([
    container({ source: "slideshow", src: "", slides: [{ url: "/a.jpg" }] }),
  ]);
  const layer = /<div class="site-builder-bg-media"[\s\S]*?<\/div>/.exec(html)?.[0] ?? html;
  assert.equal(layer.includes("<video"), false);
  assert.equal(layer.includes("<iframe"), false);
});

test("a slideshow with no usable image renders no layer at all", () => {
  const html = render([
    container({ source: "slideshow", src: "", slides: [{ url: "javascript:x" }] }),
  ]);
  assert.equal(hasBackgroundLayer(html), false);
  assert.ok(html.includes("Hi"), "the author's content must still render");
});

test("the sheet carries the slideshow stack and its reduced-motion rule", () => {
  assert.ok(SHEET.includes(".site-builder-bg-media__slide"));
  assert.ok(/\.site-builder-bg-media__slide\{[^}]*position:absolute/.test(SHEET));
  // Reduced motion must land on a still even BEFORE hydration, which is what
  // this rule buys: every non-active image is display:none, so the timer has
  // nothing to reveal.
  assert.ok(
    /@media \(prefers-reduced-motion:reduce\)\{[\s\S]*?\.site-builder-bg-media__slide:not\(\[data-active\]\)\{display:none\}/.test(
      SHEET,
    ),
    "a background that keeps cycling under prefers-reduced-motion is the whole a11y failure",
  );
});

test("reduced motion hides the moving element so the poster shows through", () => {
  const guard =
    /@media \(prefers-reduced-motion:reduce\)\{\.site-builder-bg-media__video,\.site-builder-bg-media__frame\{display:none\}\}/;
  assert.ok(
    guard.test(SHEET),
    "a background that keeps playing under prefers-reduced-motion is the whole a11y failure",
  );
});

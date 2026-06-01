import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BuilderNodeRendererStyles, renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";
import { renderInlineRich } from "@/lib/site-admin/sections/shared/rich-text";

function renderRich(input: string): string {
  return renderToStaticMarkup(
    createElement(Fragment, null, ...renderInlineRich(input)) as Parameters<
      typeof renderToStaticMarkup
    >[0],
  );
}

/**
 * Render-output regression suite — locks in that the builder's STYLE ESCAPES,
 * ENTRANCE ANIMATIONS, and Living-Components PHASE 3 resolution actually emit
 * the right CSS/markup through the real renderBuilderNodes path. Most of the
 * marathon's breadth was verified by throwaway renderToStaticMarkup scripts;
 * this makes those assertions permanent so a future change can't silently
 * regress the published render. Deterministic — no browser.
 */

function render(nodes: BuilderNode[], components?: Record<string, BuilderNode>): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      ...(components ? { components } : {}),
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

function container(style: Record<string, unknown>): BuilderNode {
  return {
    id: "c1",
    kind: "container",
    props: { layout: "stack", style },
    children: [{ id: "h", kind: "heading", props: { text: "Hi", level: 2 } }],
  } as BuilderNode;
}

function countRendererStyles(html: string): number {
  return (html.match(/data-builder-node-renderer-styles/g) ?? []).length;
}

// ── Style escapes → CSS ───────────────────────────────────────────────────────

test("escapes: premium-2026 effect + interaction escapes emit correct CSS", () => {
  const html = render([
    container({
      clipPath: "circle(50%)",
      maskImage: "linear-gradient(#000,transparent)",
      textStroke: "1px #111",
      cursor: "grab",
      userSelect: "none",
      pointerEvents: "none",
      scrollSnapType: "x mandatory",
      scrollSnapAlign: "center",
    }),
  ]);
  for (const css of [
    "clip-path:circle(50%)",
    "cursor:grab",
    "scroll-snap-type:x mandatory",
    "scroll-snap-align:center",
    "pointer-events:none",
  ]) {
    assert.ok(html.includes(css), `expected ${css}`);
  }
  assert.ok(html.toLowerCase().includes("mask-image"), "mask-image");
  assert.ok(html.includes("text-stroke"), "-webkit-text-stroke");
  assert.ok(html.includes("user-select:none"), "user-select");
});

test("escapes: focus / form theming escapes emit correct CSS", () => {
  const html = render([
    container({
      outline: "2px solid #6366f1",
      outlineOffset: "2px",
      accentColor: "#ec4899",
      caretColor: "#111",
    }),
  ]);
  assert.ok(html.includes("outline:2px solid"), "outline");
  assert.ok(html.includes("outline-offset:2px"), "outline-offset");
  assert.ok(html.includes("accent-color"), "accent-color");
  assert.ok(html.includes("caret-color"), "caret-color");
});

test("escapes: surface + transform + blend escapes emit correct CSS", () => {
  const html = render([
    container({
      boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
      opacity: 0.5,
      filter: "blur(2px)",
      backdropFilter: "blur(8px)",
      mixBlendMode: "multiply",
      rotate: "10deg",
      scale: "1.1",
      translate: "0 -4px",
      backgroundClip: "text",
    }),
  ]);
  for (const css of [
    "box-shadow:0 8px 24px",
    "opacity:0.5",
    "filter:blur(2px)",
    "mix-blend-mode:multiply",
    "rotate:10deg",
    "scale:1.1",
    "translate:0 -4px",
  ]) {
    assert.ok(html.includes(css), `expected ${css}`);
  }
  assert.ok(html.toLowerCase().includes("backdrop-filter"), "backdrop-filter");
});

test("transitions: longhands emit through renderer CSS vars", () => {
  const html = render([
    container({
      transitionProperty: "background-color, color",
      transitionDuration: "320ms",
      transitionTimingFunction: "cubic-bezier(.2,.8,.2,1)",
      transitionDelay: "40ms",
      responsive: {
        mobile: {
          transitionDuration: "120ms",
        },
      },
    }),
  ]);

  assert.ok(
    html.includes(
      ".site-builder-node[data-builder-style-transition]{transition-property:var(--bn-transition-property,all)",
    ),
    "static transition rule",
  );
  assert.ok(
    html.includes('data-builder-style-transition=""'),
    "base transition data gate",
  );
  assert.ok(
    html.includes('data-builder-style-mobile-transition=""'),
    "mobile transition data gate",
  );
  assert.ok(
    html.includes("--bn-transition-property:background-color, color"),
    "base property var",
  );
  assert.ok(html.includes("--bn-transition-duration:320ms"), "base duration");
  assert.ok(
    html.includes("--bn-transition-timing-function:cubic-bezier(.2,.8,.2,1)"),
    "base easing",
  );
  assert.ok(html.includes("--bn-transition-delay:40ms"), "base delay");
  assert.ok(
    html.includes("--bn-mobile-transition-duration:120ms"),
    "mobile duration",
  );
});

test("transitions: hover auto-default emits easing without a shorthand", () => {
  const html = render([
    container({
      hover: { backgroundColor: "#111" },
    }),
  ]);

  assert.ok(
    html.includes('data-builder-style-transition=""'),
    "hover arms transition gate",
  );
  assert.ok(html.includes("--bn-transition-property:all"), "default property");
  assert.ok(html.includes("--bn-transition-duration:.2s"), "default duration");
  assert.ok(!html.includes("transition:all .2s ease"), "no inline shorthand");
});

test("container queries: query containers and slot-width overrides emit", () => {
  const html = render([
    {
      id: "slot",
      kind: "container",
      props: {
        layout: "stack",
        style: {
          containerType: "inline-size",
          containerName: "pricing-card",
        },
      },
      children: [
        {
          id: "copy",
          kind: "paragraph",
          props: {
            text: "Slot-aware copy",
            style: {
              containerQueries: {
                mobile: {
                  fontSize: "14px",
                  backgroundColor: "#f8fafc",
                  gridTemplateColumns: "1fr",
                },
              },
            },
          },
        },
      ],
    } as BuilderNode,
  ]);

  assert.ok(
    html.includes(
      ".site-builder-node[data-builder-style-container-type]{container-type:var(--bn-container-type)",
    ),
    "container-type static rule",
  );
  assert.ok(html.includes("--bn-container-type:inline-size"), "container type var");
  assert.ok(html.includes("--bn-container-name:pricing-card"), "container name var");
  assert.ok(html.includes("@container (max-width:640px)"), "mobile container query");
  assert.ok(
    html.includes('data-builder-style-cq-mobile-font-size=""'),
    "container mobile font-size gate",
  );
  assert.ok(
    html.includes("--bn-cq-mobile-font-size:14px"),
    "container mobile font-size var",
  );
  assert.ok(
    html.includes('data-builder-style-cq-mobile-bg-color=""'),
    "container mobile background gate",
  );
  assert.ok(
    html.includes("--bn-cq-mobile-bg-color:#f8fafc"),
    "container mobile background var",
  );
  assert.ok(
    html.includes('data-builder-style-cq-mobile-grid-template-columns=""'),
    "container mobile grid-template gate",
  );
  assert.ok(
    html.includes("--bn-cq-mobile-grid-template-columns:1fr"),
    "container mobile grid-template var",
  );
});

// ── Entrance animation ────────────────────────────────────────────────────────

test("animation: preset + easing resolution + scroll-driven timeline", () => {
  const html = render([
    container({
      animationPreset: "rise",
      animationDuration: "0.8s",
      animationEasing: "back",
      animationTrigger: "scroll",
    }),
  ]);
  assert.match(
    html,
    /animation:bn-anim-rise 0\.8s cubic-bezier\(0\.34, ?1\.56/,
    "rise + back-easing shorthand",
  );
  assert.ok(html.includes("view()"), "scroll-driven animation-timeline");
});

test("animation: all keyframes + reduced-motion guard ship in the static sheet", () => {
  const html = render([container({ animationPreset: "fade-in" })]);
  for (const kf of [
    "@keyframes bn-anim-fade-in",
    "@keyframes bn-anim-rise",
    "@keyframes bn-anim-zoom-in",
    "@keyframes bn-anim-flip-in",
    "@keyframes bn-anim-bounce-in",
  ]) {
    assert.ok(html.includes(kf), `expected ${kf}`);
  }
  assert.ok(html.includes("prefers-reduced-motion"), "reduced-motion guard");
});

// ── Renderer stylesheet de-duplication ───────────────────────────────────────

test("renderer css: standalone render remains self-contained", () => {
  const html = render([container({})]);
  assert.equal(countRendererStyles(html), 1);
  assert.ok(html.includes(".site-builder-node--container"), "static sheet");
});

test("renderer css: page-level sheet plus opt-out renders one style tag", () => {
  const first = renderBuilderNodes([container({})], {
    mode: "freeform",
    includeRendererStyles: false,
  });
  const second = renderBuilderNodes([container({ marginTop: "s" })], {
    mode: "freeform",
    includeRendererStyles: false,
  });
  const html = renderToStaticMarkup(
    createElement(Fragment, null, createElement(BuilderNodeRendererStyles), first, second),
  );

  assert.equal(countRendererStyles(html), 1);
  assert.ok(html.includes("data-builder-node-id=\"c1\""), "first section renders");
});

// -- Font loading --------------------------------------------------------------

test("font loading: node font families emit Google stylesheet links", () => {
  const html = renderToStaticMarkup(
    renderBuilderNodes(
      [
        container({
          fontFamily: '"Manrope", system-ui, sans-serif',
          responsive: {
            mobile: {
              fontFamily:
                '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',
            },
          },
          containerQueries: {
            tablet: {
              fontFamily: '"DM Sans", system-ui, sans-serif',
            },
          },
        }),
      ],
      {
        mode: "freeform",
        includeRendererStyles: false,
      },
    ) as Parameters<typeof renderToStaticMarkup>[0],
  );

  assert.ok(html.includes("data-builder-node-fonts"), "font link marker");
  assert.ok(
    html.includes("family=Manrope:wght@400;500;600;700"),
    "desktop family loaded",
  );
  assert.ok(
    html.includes("family=IBM+Plex+Mono:wght@400;500;700"),
    "responsive family loaded",
  );
  assert.ok(
    html.includes("family=DM+Sans:wght@400;500;700"),
    "container-query family loaded",
  );
  assert.equal(countRendererStyles(html), 0);
});

test("font loading: bundled Next fonts do not emit extra Google links", () => {
  const html = renderToStaticMarkup(
    renderBuilderNodes(
      [container({ fontFamily: '"Raleway", var(--font-body-sans), system-ui, sans-serif' })],
      {
        mode: "freeform",
        includeRendererStyles: false,
      },
    ) as Parameters<typeof renderToStaticMarkup>[0],
  );

  assert.ok(!html.includes("data-builder-node-fonts"), "no google link needed");
  assert.ok(html.includes("font-family:&quot;Raleway&quot;"), "font still renders");
});

// -- Node kinds ----------------------------------------------------------------

test("node kind: video renders hosted media with playback controls", () => {
  const html = render([
    {
      id: "video-1",
      kind: "video",
      props: {
        src: "https://cdn.example.com/demo.mp4",
        poster: "https://cdn.example.com/poster.jpg",
        autoplay: true,
        muted: true,
        loop: true,
        controls: true,
        style: {
          aspectRatio: "16:9",
          objectFit: "cover",
          borderRadius: "18px",
        },
      },
    } as BuilderNode,
  ]);

  assert.ok(html.includes('data-builder-node-kind="video"'), "kind marker");
  assert.ok(html.includes('src="https://cdn.example.com/demo.mp4"'), "video src");
  assert.ok(html.includes('poster="https://cdn.example.com/poster.jpg"'), "poster");
  assert.ok(html.includes("autoPlay"), "autoplay");
  assert.ok(html.includes("muted"), "muted");
  assert.ok(html.includes("loop"), "loop");
  assert.ok(html.includes("controls"), "controls");
  assert.ok(html.includes("aspect-ratio:16 / 9"), "aspect ratio");
  assert.ok(html.includes("border-radius:18px"), "shared style");
});

test("node kind: embed renders a sandboxed iframe", () => {
  const html = render([
    {
      id: "embed-1",
      kind: "embed",
      props: {
        src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
        title: "Launch film",
        provider: "youtube",
        allowFullScreen: true,
        style: { aspectRatio: "16:9" },
      },
    } as BuilderNode,
  ]);

  assert.ok(html.includes('data-builder-node-kind="embed"'), "kind marker");
  assert.ok(html.includes('data-builder-embed-provider="youtube"'), "provider");
  assert.ok(
    html.includes('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"'),
    "iframe src",
  );
  assert.ok(html.includes('title="Launch film"'), "title");
  assert.ok(html.includes("sandbox="), "sandboxed");
  assert.ok(html.includes("allow-forms"), "sandbox allows forms");
  assert.ok(html.includes("allowFullScreen"), "fullscreen enabled");
  assert.ok(html.includes("referrerPolicy"), "referrer policy set");
  assert.ok(html.includes("aspect-ratio:16 / 9"), "aspect ratio");
});

test("node kind: icon renders inline currentColor svg", () => {
  const html = render([
    {
      id: "icon-1",
      kind: "icon",
      props: {
        icon: "check",
        label: "Included",
        size: "lg",
        style: { textColor: "#0f766e" },
      },
    } as BuilderNode,
  ]);

  assert.ok(html.includes('data-builder-node-kind="icon"'), "kind marker");
  assert.ok(html.includes('data-builder-icon="check"'), "icon marker");
  assert.ok(html.includes('role="img"'), "semantic icon");
  assert.ok(html.includes('aria-label="Included"'), "accessible label");
  assert.ok(html.includes('stroke="currentColor"'), "currentColor stroke");
  assert.ok(html.includes("font-size:3rem"), "size");
  assert.ok(html.includes("color:#0f766e"), "shared style color");
});

test("node kind: pricing_table renders responsive tiers with feature marks", () => {
  const html = render([
    {
      id: "pricing-1",
      kind: "pricing_table",
      props: {
        style: { gap: "24px" },
        tiers: [
          {
            id: "tier-basic",
            name: "Basic",
            description: "A lean launch package.",
            price: "$800",
            period: "project",
            ctaLabel: "Start basic",
            ctaHref: "/inquire",
            features: [
              { label: "Planning call" },
              { label: "Priority revisions", included: false },
            ],
          },
          {
            id: "tier-pro",
            name: "Pro",
            price: "$1,600",
            period: "project",
            ctaLabel: "Start pro",
            ctaHref: "/inquire?plan=pro",
            highlighted: true,
            features: [{ label: "Planning call" }],
          },
        ],
      },
    } as BuilderNode,
  ]);

  assert.ok(html.includes('data-builder-node-kind="pricing_table"'), "kind marker");
  assert.ok(
    html.includes(".site-builder-node--pricing-table{width:100%"),
    "static pricing table CSS",
  );
  assert.ok(
    html.includes(".site-builder-node--pricing-table{grid-template-columns:1fr}"),
    "mobile stack rule",
  );
  assert.ok(html.includes("--bn-pricing-columns:2"), "column count var");
  assert.ok(html.includes("--bn-gap:24px"), "gap style override");
  assert.ok(html.includes('data-builder-pricing-highlighted="true"'), "highlight");
  assert.ok(html.includes('href="/inquire?plan=pro"'), "CTA href");
  assert.ok(html.includes('data-builder-feature-included="false"'), "excluded feature");
  assert.ok(html.includes("✓"), "check mark");
  assert.ok(html.includes("×"), "x mark");
});

test("security: embed sandbox never grants allow-same-origin (would defeat itself)", () => {
  const html = render([
    {
      id: "embed-sec",
      kind: "embed",
      props: { src: "https://player.vimeo.com/video/123", provider: "vimeo", style: {} },
    } as BuilderNode,
  ]);
  // allow-same-origin + allow-scripts together let framed content remove its own
  // sandbox attribute — they must never ship together.
  assert.ok(html.includes("allow-scripts"), "scripts allowed (players need it)");
  assert.ok(!html.includes("allow-same-origin"), "must NOT grant allow-same-origin");
});

test("node kind: rich_text renders annotations and sanitizes unsafe links", () => {
  const html = render([
    {
      id: "rich-1",
      kind: "rich_text",
      props: {
        text: "{b}Bold{/b} and {i}italic{/i} with [safe](https://example.com) plus [local](/directory) and [bad](javascript:alert(1)).",
        style: { textColor: "#111827" },
      },
    } as BuilderNode,
  ]);

  assert.ok(html.includes('data-builder-node-kind="rich_text"'), "kind marker");
  assert.ok(html.includes("<strong>Bold</strong>"), "bold annotation");
  assert.ok(html.includes("<em>italic</em>"), "italic annotation");
  assert.ok(html.includes('href="https://example.com"'), "https link kept");
  assert.ok(html.includes('target="_blank"'), "external link target");
  assert.ok(html.includes('href="/directory"'), "relative link kept");
  assert.ok(html.includes("bad"), "unsafe label kept as text");
  assert.ok(!html.includes("javascript:alert"), "unsafe href removed");
  assert.ok(html.includes("color:#111827"), "shared style");
});

test("a11y: non-decorative icon without a label falls back to an accessible name", () => {
  const html = render([
    {
      id: "icon-no-label",
      kind: "icon",
      props: { icon: "check", decorative: false, style: {} },
    } as BuilderNode,
  ]);
  assert.ok(html.includes('role="img"'), "semantic icon");
  // role=img must never be nameless (WCAG 4.1.2) — fall back to the icon name.
  assert.ok(html.includes('aria-label="check"'), "accessible-name fallback");
});

// ── Living Components Phase 3 ─────────────────────────────────────────────────

const MASTER: BuilderNode = {
  id: "master", kind: "container", props: { layout: "stack" },
  children: [
    { id: "m-h", kind: "heading", props: { text: "MASTER HEADING", level: 2 } },
    { id: "m-b", kind: "button", props: { label: "Master CTA", href: "/m", tone: "primary" } },
  ],
} as BuilderNode;

function instance(id: string, overrides?: Record<string, unknown>): BuilderNode {
  return {
    id, kind: "container",
    props: { layout: "stack", instanceOf: "cmp-1", ...(overrides ? { instanceOverrides: overrides } : {}) },
    children: [{ id: `${id}-fallback`, kind: "heading", props: { text: "FALLBACK", level: 2 } }],
  } as BuilderNode;
}

test("phase3: instance resolves master LIVE + per-instance override + namespaced ids", () => {
  const html = render(
    [instance("instA"), instance("instB", { "m-h": { text: "OVERRIDDEN" } })],
    { "cmp-1": MASTER },
  );
  assert.ok(html.includes("MASTER HEADING"), "instA shows master heading live");
  assert.ok(html.includes("OVERRIDDEN"), "instB heading overridden");
  assert.ok((html.match(/Master CTA/g) || []).length >= 2, "both instances keep master CTA (structure linked)");
  assert.ok(html.includes("instA__m-h") && html.includes("instB__m-h"), "ids namespaced per instance");
  assert.ok(!html.includes("FALLBACK"), "live resolution replaces stored fallback");
});

test("phase3: missing component + no-components both fall back to stored children (never blank)", () => {
  // component map present but missing this id
  const missing = render([instance("instC")], { "other-cmp": MASTER });
  assert.ok(missing.includes("FALLBACK") && !missing.includes("MASTER HEADING"), "missing component → stored fallback");
  // no components passed at all
  const none = render([instance("instD")]);
  assert.ok(none.includes("FALLBACK") && !none.includes("MASTER HEADING"), "no components → stored fallback");
});

// ── SECURITY: section-level inline rich text href allowlist ───────────────────
// Regression for a LIVE pre-Wave-2 prod XSS: renderInlineRich rendered markdown
// link hrefs straight into <a href> with no scheme guard, so a `javascript:`
// link in any section text field was a clickable cross-tenant XSS on the shared
// apex (parent-scoped cookies, unsafe-inline CSP). The href allowlist now blocks
// it at the shared chokepoint that ~45 section components funnel through.

test("security: renderInlineRich keeps safe https + relative markdown links", () => {
  const html = renderRich("[ext](https://example.com) and [home](/directory) and [anchor](#top)");
  assert.ok(html.includes('href="https://example.com"'), "https anchor kept");
  assert.ok(html.includes('href="/directory"'), "relative anchor kept");
  assert.ok(html.includes('href="#top"'), "in-page anchor kept");
  assert.ok(html.includes('target="_blank"'), "external link target preserved");
});

test("security: renderInlineRich neutralizes javascript:/data:/vbscript: links to plain text", () => {
  for (const scheme of [
    "[click](javascript:alert(1))",
    "[x](JavaScript:alert(1))",
    "[y](data:text/html,<script>alert(1)</script>)",
    "[z](vbscript:msgbox(1))",
  ]) {
    const html = renderRich(scheme).toLowerCase();
    assert.ok(!/<a[\s>]/.test(html), `no anchor rendered for ${scheme}`);
    assert.ok(!html.includes("href="), `no href attribute emitted for ${scheme}`);
  }
  // the link label survives as readable text
  assert.ok(renderRich("[click](javascript:alert(1))").includes("click"), "label kept as text");
});

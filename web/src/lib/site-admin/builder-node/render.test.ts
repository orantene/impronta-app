import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { hasRenderableBuilderNodes, renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";

function render(nodes: ReadonlyArray<BuilderNode>): string {
  return renderToStaticMarkup(
    createElement(Fragment, null, renderBuilderNodes(nodes, { publicPathPrefix: "/impronta" })),
  );
}

describe("renderBuilderNodes", () => {
  it("renders freeform leaf nodes with selectable builder node ids", () => {
    const html = render([
      {
        id: "free:headline",
        kind: "heading",
        props: { text: "Premium builder block", level: 2 },
      },
      {
        id: "free:copy",
        kind: "paragraph",
        props: { text: "A freeform paragraph that belongs to the builder tree." },
      },
    ]);

    assert.match(html, /data-builder-node-id="free:headline"/);
    assert.match(html, /data-builder-node-kind="heading"/);
    assert.match(html, />Premium builder block</);
    assert.match(html, /data-builder-node-id="free:copy"/);
  });

  it("skips legacy role-bound child nodes in freeform mode", () => {
    const html = render([
      {
        id: "legacy:body:0:hero:heading:headline",
        kind: "heading",
        props: { text: "Already rendered by the legacy section component", level: 1 },
      },
      {
        id: "free:extra",
        kind: "paragraph",
        props: { text: "Additional freeform content." },
      },
    ]);

    assert.doesNotMatch(html, /Already rendered by the legacy section component/);
    assert.match(html, /Additional freeform content/);
  });

  it("renders nested layout nodes and prefixes internal button hrefs", () => {
    const html = render([
      {
        id: "free:container",
        kind: "container",
        props: {
          layout: "stack",
          gap: "s",
          dataBinding: {
            sourceKey: "featured_talent_profiles",
            mode: "bound",
            maxItems: 4,
          },
        },
        children: [
          {
            id: "free:cta",
            kind: "button",
            props: { label: "Book now", href: "/contact", tone: "primary" },
          },
        ],
      },
    ]);

    assert.match(html, /data-builder-node-id="free:container"/);
    assert.match(html, /data-builder-data-source="featured_talent_profiles"/);
    assert.match(html, /data-builder-data-mode="bound"/);
    assert.match(html, /data-builder-data-max-items="4"/);
    assert.match(html, /data-builder-node-id="free:cta"/);
    assert.match(html, /href="\/impronta\/contact"/);
  });

  it("renders live featured talent data for data-ready containers", () => {
    const html = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        renderBuilderNodes(
          [
            {
              id: "free:featured",
              kind: "container",
              props: {
                layout: "stack",
                gap: "m",
                dataBinding: {
                  sourceKey: "featured_talent_profiles",
                  mode: "bound",
                  maxItems: 2,
                },
              },
              children: [
                {
                  id: "free:featured:heading",
                  kind: "heading",
                  props: { text: "Featured talent", level: 2 },
                },
                {
                  id: "free:featured:copy",
                  kind: "paragraph",
                  props: { text: "Handpicked by the agency" },
                },
                {
                  id: "free:featured:fallback",
                  kind: "container",
                  props: { layout: "grid", columns: 4 },
                  children: [
                    {
                      id: "free:featured:fallback:name",
                      kind: "heading",
                      props: { text: "Fallback talent", level: 3 },
                    },
                  ],
                },
              ],
            },
          ],
          {
            publicPathPrefix: "/impronta",
            dataSources: {
              featuredTalentProfiles: [
                {
                  id: "talent-1",
                  profileCode: "adriana-vega",
                  slugPart: "adriana-vega",
                  displayName: "Adriana Vega",
                  primaryTalentTypeLabel: "Fashion Model",
                  locationLabel: "Cancun, MX",
                  isFeatured: true,
                  thumbnailUrl: null,
                },
                {
                  id: "talent-2",
                  profileCode: "omar-haddad",
                  slugPart: null,
                  displayName: "Omar Haddad",
                  primaryTalentTypeLabel: "Brand Ambassador",
                  locationLabel: "Cancun, MX",
                  isFeatured: false,
                  thumbnailUrl: null,
                },
              ],
            },
          },
        ),
      ),
    );

    assert.match(html, /data-builder-live-data-grid="featured_talent_profiles"/);
    assert.match(html, />Featured talent</);
    assert.match(html, /Adriana Vega/);
    assert.match(html, /Omar Haddad/);
    assert.doesNotMatch(html, /Fallback talent/);
    assert.match(html, /href="\/impronta\/t\/adriana-vega-adriana-vega"/);
  });

  it("renders live tenant location data for data-ready location containers", () => {
    const html = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        renderBuilderNodes(
          [
            {
              id: "free:locations",
              kind: "container",
              props: {
                layout: "stack",
                gap: "m",
                dataBinding: {
                  sourceKey: "talent_locations",
                  mode: "bound",
                  maxItems: 2,
                },
              },
              children: [
                {
                  id: "free:locations:heading",
                  kind: "heading",
                  props: { text: "Explore by location", level: 2 },
                },
                {
                  id: "free:locations:copy",
                  kind: "paragraph",
                  props: { text: "Where we operate" },
                },
                {
                  id: "free:locations:fallback",
                  kind: "button",
                  props: { label: "Fallback city", href: "/directory" },
                },
              ],
            },
          ],
          {
            publicPathPrefix: "/impronta",
            dataSources: {
              talentLocations: [
                {
                  id: "loc-1",
                  citySlug: "cancun",
                  displayName: "Cancun",
                  talentCount: 7,
                },
                {
                  id: "loc-2",
                  citySlug: "ibiza",
                  displayName: "Ibiza",
                  talentCount: 4,
                },
              ],
            },
          },
        ),
      ),
    );

    assert.match(html, /data-builder-live-data-grid="talent_locations"/);
    assert.match(html, />Explore by location</);
    assert.match(html, /Cancun/);
    assert.match(html, /7 talents/);
    assert.match(html, /href="\/impronta\/directory\?location=cancun"/);
    assert.doesNotMatch(html, /Fallback city/);
  });

  it("renders live directory shortcut data for data-ready search containers", () => {
    const html = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        renderBuilderNodes(
          [
            {
              id: "free:search",
              kind: "container",
              props: {
                layout: "stack",
                gap: "m",
                dataBinding: {
                  sourceKey: "tenant_directory_search",
                  mode: "bound",
                  maxItems: 6,
                },
              },
              children: [
                {
                  id: "free:search:heading",
                  kind: "heading",
                  props: { text: "Find the right talent for your brief", level: 1 },
                },
                {
                  id: "free:search:copy",
                  kind: "paragraph",
                  props: { text: "Search the directory by role." },
                },
                {
                  id: "free:search:fallback",
                  kind: "button",
                  props: { label: "Fallback type", href: "/directory" },
                },
              ],
            },
          ],
          {
            publicPathPrefix: "/impronta",
            dataSources: {
              directoryShortcuts: [
                { id: "tax-1", slug: "models", name: "Models" },
                { id: "tax-2", slug: "hosts", name: "Hosts" },
              ],
            },
          },
        ),
      ),
    );

    assert.match(html, /data-builder-live-data-grid="tenant_directory_search"/);
    assert.match(html, />Find the right talent for your brief</);
    assert.match(html, /Models/);
    assert.match(html, /Hosts/);
    assert.match(html, /href="\/impronta\/directory\?type=models"/);
    assert.doesNotMatch(html, /Fallback type/);
  });

  it("renders button interaction-state tone attributes", () => {
    const html = render([
      {
        id: "free:cta",
        kind: "button",
        props: {
          label: "Start brief",
          href: "/brief",
          tone: "secondary",
          stateStyles: {
            hover: { tone: "primary" },
            focus: { tone: "primary" },
            active: { tone: "secondary" },
            disabled: { tone: "secondary" },
          },
        },
      },
    ]);

    assert.match(html, /data-builder-button-tone="secondary"/);
    assert.match(html, /data-builder-button-hover-tone="primary"/);
    assert.match(html, /data-builder-button-focus-tone="primary"/);
    assert.match(html, /data-builder-button-active-tone="secondary"/);
    assert.match(html, /data-builder-button-disabled-tone="secondary"/);
    assert.match(html, /data-builder-button-hover-tone="primary"\]:hover/);
  });

  it("renders freeform block style attributes without default rounded image corners", () => {
    const html = render([
      {
        id: "free:headline",
        kind: "heading",
        props: {
          text: "Styled headline",
          level: 2,
          style: {
            align: "center",
            size: "xl",
            tone: "strong",
            maxWidth: "reading",
            marginBottom: "m",
          },
        },
      },
      {
        id: "free:image",
        kind: "image",
        props: {
          src: "https://images.unsplash.com/photo-1494790108377-be9c29b29330",
          alt: "Portrait",
          style: {
            radius: "none",
            objectFit: "contain",
            aspectRatio: "4:3",
            responsive: {
              tablet: {
                maxWidth: "wide",
                aspectRatio: "16:9",
              },
              mobile: {
                maxWidth: "full",
                aspectRatio: "1:1",
                objectFit: "cover",
              },
            },
          },
        },
      },
    ]);

    assert.match(html, /data-builder-style-align="center"/);
    assert.match(html, /data-builder-style-size="xl"/);
    assert.match(html, /data-builder-style-width="reading"/);
    assert.match(html, /data-builder-style-radius="none"/);
    assert.match(html, /data-builder-style-fit="contain"/);
    assert.match(html, /data-builder-style-ratio="4:3"/);
    assert.match(html, /data-builder-style-tablet-width="wide"/);
    assert.match(html, /data-builder-style-tablet-ratio="16:9"/);
    assert.match(html, /data-builder-style-mobile-width="full"/);
    assert.match(html, /data-builder-style-mobile-ratio="1:1"/);
    assert.match(html, /data-builder-style-mobile-fit="cover"/);
    assert.doesNotMatch(html, /border-radius:8px/);
  });

  it("renders freeform surface escapes (shadow, background image, opacity)", () => {
    const html = render([
      {
        id: "free:surface",
        kind: "heading",
        props: {
          text: "Surface styled",
          level: 2,
          style: {
            boxShadow: "0 4px 8px rgba(18,18,18,0.06)",
            backgroundImage: "linear-gradient(180deg,#fff,#000)",
            opacity: 0.5,
            responsive: {
              mobile: {
                boxShadow: "none",
                backgroundImage: "url(/m.jpg)",
                opacity: 1,
              },
            },
          },
        },
      },
    ]);

    // Desktop free values land inline on the element (match the specific value
    // so we don't accidentally hit the static stylesheet's var() rules).
    assert.match(html, /box-shadow:0 4px 8px/);
    assert.match(html, /background-image:linear-gradient/);
    assert.match(html, /opacity:0\.5/);
    // Per-breakpoint overrides are gated by their own data-attr so an unset
    // breakpoint never clobbers the desktop value at computed-value time. The
    // gate renders as an empty-string attribute (`=""`), which distinguishes it
    // from the bare `[data-...]` selectors that always appear in the CSS sheet.
    assert.match(html, /data-builder-style-mobile-shadow=""/);
    assert.match(html, /data-builder-style-mobile-bg-image=""/);
    assert.match(html, /data-builder-style-mobile-opacity=""/);
    // No tablet override was set, so the tablet gate attrs stay absent.
    assert.doesNotMatch(html, /data-builder-style-tablet-shadow=""/);
    assert.doesNotMatch(html, /data-builder-style-tablet-opacity=""/);
  });

  it("renders the free border-radius escape over the radius token", () => {
    const html = render([
      {
        id: "free:rounded",
        kind: "heading",
        props: {
          text: "Rounded",
          level: 2,
          style: {
            radius: "sm",
            borderRadius: "20px 20px 0 0",
            responsive: { mobile: { borderRadius: "8px" } },
          },
        },
      },
    ]);

    // The free value lands inline with its shorthand preserved and beats the
    // radius token (which would otherwise resolve to the "sm" preset).
    assert.match(html, /border-radius:20px 20px 0 0/);
    // The mobile override is gated by its own attr; no tablet override was set.
    assert.match(html, /data-builder-style-mobile-radius-free=""/);
    assert.doesNotMatch(html, /data-builder-style-tablet-radius-free=""/);
  });

  it("renders the free gap escape over the layout gap token", () => {
    const html = render([
      {
        id: "free:gap",
        kind: "container",
        props: {
          layout: "stack",
          gap: "m",
          style: {
            gap: "30px",
            responsive: { mobile: { gap: "10px" } },
          },
        },
        children: [
          { id: "free:gap:p", kind: "paragraph", props: { text: "Spaced" } },
        ],
      },
    ]);

    // The free gap reassigns the --bn-gap variable inline, beating the token
    // ("m" → 1.25rem) that the container would otherwise resolve to.
    assert.match(html, /--bn-gap:30px/);
    // The mobile override is gated by its own attr; no tablet override was set.
    assert.match(html, /data-builder-style-mobile-gap-free=""/);
    assert.doesNotMatch(html, /data-builder-style-tablet-gap-free=""/);
  });

  it("renders the free per-side margin escapes over the margin token", () => {
    const html = render([
      {
        id: "free:margin",
        kind: "paragraph",
        props: {
          text: "Spaced",
          style: {
            marginTop: "s",
            marginTopFree: "44px",
            marginLeftFree: "12px",
            responsive: { mobile: { marginBottomFree: "8px" } },
          },
        },
      },
    ]);

    // The free top margin beats the marginTop token; left margin has no token at
    // all and lands inline. Both serialize to their exact values.
    assert.match(html, /margin-top:44px/);
    assert.match(html, /margin-left:12px/);
    // The mobile override is gated by its own attr; no tablet override was set.
    assert.match(html, /data-builder-style-mobile-margin-bottom-free=""/);
    assert.doesNotMatch(html, /data-builder-style-tablet-margin-top-free=""/);
  });

  it("renders the free min/max dimension clamps over the width token", () => {
    const html = render([
      {
        id: "free:clamps",
        kind: "paragraph",
        props: {
          text: "Clamped",
          style: {
            maxWidth: "narrow",
            maxWidthFree: "1280px",
            minWidth: "320px",
            maxHeight: "480px",
            responsive: { mobile: { maxHeight: "200px" } },
          },
        },
      },
    ]);

    // The free max-width clamp beats the maxWidth token; min-width / max-height
    // have no token and land inline at their exact values.
    assert.match(html, /max-width:1280px/);
    assert.match(html, /min-width:320px/);
    assert.match(html, /max-height:480px/);
    // The mobile max-height override is gated by its own attr; no tablet was set.
    assert.match(html, /data-builder-style-mobile-max-height=""/);
    assert.doesNotMatch(html, /data-builder-style-tablet-max-width-free=""/);
  });

  it("renders italic + text-decoration escapes", () => {
    const html = render([
      {
        id: "free:type-style",
        kind: "paragraph",
        props: {
          text: "Styled",
          style: {
            fontStyle: "italic",
            textDecoration: "underline",
            responsive: { mobile: { textDecoration: "line-through" } },
          },
        },
      },
    ]);

    // Both land inline at desktop with their literal CSS values.
    assert.match(html, /font-style:italic/);
    assert.match(html, /text-decoration:underline/);
    // The mobile decoration override is gated by its own attr; no tablet was set.
    assert.match(html, /data-builder-style-mobile-text-decoration=""/);
    assert.doesNotMatch(html, /data-builder-style-tablet-font-style=""/);
  });

  it("renders positioning escapes (position + inset offsets)", () => {
    const html = render([
      {
        id: "free:pos",
        kind: "paragraph",
        props: {
          text: "Pinned",
          style: {
            position: "absolute",
            top: "12px",
            left: "-8px",
            responsive: { mobile: { position: "relative" } },
          },
        },
      },
    ]);

    // Desktop position + offsets land inline with their literal CSS values
    // (negatives survive for overlap designs).
    assert.match(html, /position:absolute/);
    assert.match(html, /top:12px/);
    assert.match(html, /left:-8px/);
    // The mobile position override is attr-gated; no tablet override was set.
    assert.match(html, /data-builder-style-mobile-position=""/);
    assert.doesNotMatch(html, /data-builder-style-tablet-position=""/);
  });

  it("renders stacking + clipping escapes (z-index + overflow)", () => {
    const html = render([
      {
        id: "free:stack",
        kind: "paragraph",
        props: {
          text: "Layered",
          style: {
            zIndex: 5,
            overflow: "hidden",
            responsive: {
              tablet: { zIndex: 0 },
              mobile: { overflow: "scroll" },
            },
          },
        },
      },
    ]);

    // Desktop z-index + overflow land inline with their literal values.
    assert.match(html, /z-index:5/);
    assert.match(html, /overflow:hidden/);
    // The tablet z-index override of 0 is still emitted — the gate is a
    // typeof-number check, so a valid 0 stacking level isn't dropped as falsy.
    assert.match(html, /data-builder-style-tablet-z-index=""/);
    // The mobile overflow override is attr-gated; no mobile z-index was set.
    assert.match(html, /data-builder-style-mobile-overflow=""/);
    assert.doesNotMatch(html, /data-builder-style-mobile-z-index=""/);
  });

  it("renders carousel affordances from layout props", () => {
    const html = render([
      {
        id: "free:carousel",
        kind: "carousel",
        props: {
          slidesPerView: 3,
          showArrows: true,
          showDots: true,
          loop: true,
          autoplayMs: 4000,
        },
        children: [
          {
            id: "free:slide-a",
            kind: "paragraph",
            props: { text: "First slide" },
          },
          {
            id: "free:slide-b",
            kind: "paragraph",
            props: { text: "Second slide" },
          },
        ],
      },
    ]);

    assert.match(html, /data-builder-carousel-loop="true"/);
    assert.match(html, /data-builder-carousel-autoplay-ms="4000"/);
    assert.match(html, /site-builder-node--carousel-track/);
    assert.match(html, /site-builder-node--carousel-arrow/);
    assert.match(html, /site-builder-node--carousel-dot/);
    assert.match(html, /id="free:carousel-slide-1"/);
  });
});

describe("hasRenderableBuilderNodes", () => {
  it("returns false for only legacy role-bound children", () => {
    assert.equal(
      hasRenderableBuilderNodes([
        {
          id: "legacy:body:0:hero:paragraph:copy",
          kind: "paragraph",
          props: { text: "Legacy copy" },
        },
      ]),
      false,
    );
  });
});

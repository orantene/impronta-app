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
            mode: "auto",
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
    assert.match(html, /data-builder-data-mode="auto"/);
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
                  mode: "auto",
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
                  mode: "auto",
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
                  mode: "auto",
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

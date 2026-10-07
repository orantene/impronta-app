/**
 * W-12 `portfolio` — live media widget render tests.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "./create";
import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "./render";
import type { BuilderNode } from "./types";
import type { TalentPortfolioShot } from "./portfolio-types";
import type { TalentOffering } from "@/lib/talent/offerings-types";

function render(nodes: BuilderNode[], dataSources: BuilderNodeRenderDataSources = {}): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

function portfolioNode(props: Record<string, unknown> = {}): BuilderNode {
  const base = createBuilderNode("portfolio");
  return { ...base, id: "port-1", props: { ...base.props, ...props } } as BuilderNode;
}

function shot(partial: Partial<TalentPortfolioShot> & { id: string }): TalentPortfolioShot {
  return {
    url: `https://example.test/${partial.id}.jpg`,
    alt: "Work",
    caption: null,
    offeringId: null,
    offeringTitle: null,
    albumId: null,
    ...partial,
  };
}

function offering(partial: Partial<TalentOffering> = {}): TalentOffering {
  return {
    id: "off-1",
    talentProfileId: "talent-1",
    ownerKind: "talent",
    tenantId: null,
    kind: "service",
    title: "Gel pedicure",
    description: "Semi-permanent gel on toes.",
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: 30000,
    currency: "MXN",
    bookingMode: "instant",
    reserveMode: "deposit",
    depositPct: 25,
    allowPayInPerson: true,
    requireAccountToBook: false,
    requiresIdentity: false,
    identityReason: null,
    cancellationHours: 24,
    freeReserveExpiresDays: null,
    durationMinutes: 75,
    category: "Uñas",
    inventoryQty: null,
    capacityPoolId: null,
    consumesUnits: 1,
    status: "published",
    firstPublishedAt: "2026-01-01T00:00:00Z",
    visibility: "public",
    moderationState: "approved",
    isFeatured: false,
    sortOrder: 0,
    attributes: {},
    imageUrls: ["https://example.test/gel.jpg"],
    variants: [],
    addOns: [],
    ...partial,
  };
}

test("portfolio renders empty state when no shots", () => {
  const html = render([portfolioNode({ emptyMessage: "No photos yet." })]);
  assert.match(html, /data-builder-node-kind="portfolio"/);
  assert.match(html, /No photos yet/);
});

test("portfolio filmstrip layout emits filmstrip class and service link", () => {
  const html = render(
    [portfolioNode({ layout: "filmstrip", showCaptions: true, title: "Recent work" })],
    {
      talentPortfolioShots: [
        shot({
          id: "m1",
          offeringId: "off-1",
          offeringTitle: "Gel pedicure",
          caption: "After care",
        }),
      ],
      talentOfferings: [offering()],
      talentOfferingsConfirmsByHand: true,
    },
  );
  assert.match(html, /data-portfolio-layout="filmstrip"/);
  assert.match(html, /sb-portfolio--filmstrip/);
  assert.match(html, /Recent work/);
  assert.match(html, /data-offering-id="off-1"/);
  assert.match(html, /Gel pedicure/);
  assert.match(html, /After care/);
});

test("portfolio grid / masonry / contact_sheet layouts", () => {
  const shots = [
    shot({ id: "a" }),
    shot({ id: "b" }),
    shot({ id: "c" }),
  ];
  for (const layout of ["grid", "masonry", "contact_sheet"] as const) {
    const html = render([portfolioNode({ layout })], { talentPortfolioShots: shots });
    assert.match(html, new RegExp(`data-portfolio-layout="${layout}"`));
    assert.match(html, new RegExp(`sb-portfolio--${layout}`));
    assert.match(html, /data-portfolio-media="a"/);
  }
});

test("portfolio chapter layout sticks numeral title credit and 1+2 rhythm", () => {
  const shots = [
    shot({ id: "a", caption: "Lead" }),
    shot({ id: "b", caption: "Left" }),
    shot({ id: "c", caption: "Right" }),
    shot({ id: "d", albumId: "alb-other" }),
  ];
  const html = render(
    [
      portfolioNode({
        layout: "chapter",
        chapterNumber: 2,
        title: "Lookbook",
        creditLine: "Seasonal story",
        showCaptions: true,
        albumId: "",
        limit: 3,
      }),
    ],
    { talentPortfolioShots: shots },
  );
  assert.match(html, /data-portfolio-layout="chapter"/);
  assert.match(html, /data-portfolio-chapter="II"/);
  assert.match(html, /sb-portfolio-chapter-num/);
  assert.match(html, />II</);
  assert.match(html, /Lookbook/);
  assert.match(html, /Seasonal story/);
  assert.match(html, /sb-portfolio-item--hero/);
  assert.match(html, /sb-portfolio-item--pair/);
  assert.match(html, /sb-portfolio--chapter/);
  assert.doesNotMatch(html, /\u2014/);
});

test("portfolio chapter filters by albumId collection", () => {
  const html = render(
    [
      portfolioNode({
        layout: "chapter",
        chapterNumber: 1,
        title: "Editorial",
        albumId: "alb-1",
        limit: 6,
      }),
    ],
    {
      talentPortfolioShots: [
        shot({ id: "keep", albumId: "alb-1" }),
        shot({ id: "skip", albumId: "alb-2" }),
        shot({ id: "none" }),
      ],
    },
  );
  assert.match(html, /data-portfolio-media="keep"/);
  assert.doesNotMatch(html, /data-portfolio-media="skip"/);
  assert.doesNotMatch(html, /data-portfolio-media="none"/);
});

test("F28: staggered renders at most its 5 desktop columns (no 0x0 sixth tile)", () => {
  const html = render([portfolioNode({ layout: "staggered", limit: 6 })], {
    talentPortfolioShots: Array.from({ length: 6 }, (_, i) => shot({ id: `s${i}` })),
  });
  assert.equal((html.match(/data-portfolio-media=/g) ?? []).length, 5);
  assert.doesNotMatch(html, /nth-child\(n\+6\)/);
});

test("portfolioChapterRoman maps 1..3", async () => {
  const { portfolioChapterRoman } = await import("./portfolio-defaults");
  assert.equal(portfolioChapterRoman(1), "I");
  assert.equal(portfolioChapterRoman(2), "II");
  assert.equal(portfolioChapterRoman(3), "III");
  assert.equal(portfolioChapterRoman(0), "I");
});

test("portfolio linkMode none does not emit offering CTA", () => {
  const html = render(
    [portfolioNode({ linkMode: "none", showCaptions: true })],
    {
      talentPortfolioShots: [
        shot({ id: "m1", offeringId: "off-1", offeringTitle: "Gel pedicure" }),
      ],
      talentOfferings: [offering()],
    },
  );
  assert.doesNotMatch(html, /data-offering-id=/);
  assert.doesNotMatch(html, /data-portfolio-shot-link/);
});

test("TUL-59 C: a linked shot opens a lightbox first (booking only from its own button); closed state renders the same button", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("./portfolio-shot-link.tsx", import.meta.url), "utf8"));
  assert.match(src, /const onClick = lightbox \? \(\) => setOpen\(true\) : book;/);
  assert.match(src, /data-portfolio-lightbox-book/);
  const block = await import("node:fs").then((fs) => fs.readFileSync(new URL("./portfolio-block.tsx", import.meta.url), "utf8"));
  assert.match(block, /Reservar este look/);
  assert.match(block, /Book this look/);
});

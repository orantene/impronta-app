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

function render(
  nodes: BuilderNode[],
  dataSources: BuilderNodeRenderDataSources = {},
  third?: string | boolean,
): string {
  const visitorLocale = typeof third === "string" ? third : undefined;
  const editorPreview = third === true;
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
      ...(visitorLocale ? { visitorLocale } : {}),
      ...(editorPreview
        ? {
            contentLocale: {
              locale: "en",
              defaultLocale: "en",
              chain: ["en"],
              editorPreview: true,
            },
          }
        : {}),
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
  assert.doesNotMatch(html, /Not shown on your site/);
});

test("TUL-124: empty portfolio on the builder canvas shows Not shown on your site", () => {
  const html = render([portfolioNode({ emptyMessage: "No photos yet." })], {}, true);
  assert.match(html, /Not shown on your site/);
  assert.match(html, /data-not-shown-on-site=/);
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
  const box = await import("node:fs").then((fs) => fs.readFileSync(new URL("./portfolio-lightbox.tsx", import.meta.url), "utf8"));
  assert.match(box, /data-portfolio-lightbox-book/);
  assert.match(box, /data-portfolio-lightbox\b/);
  assert.match(box, /createPortal\(/);
  assert.match(box, /document\.body/);
  const block = await import("node:fs").then((fs) => fs.readFileSync(new URL("./portfolio-block.tsx", import.meta.url), "utf8"));
  assert.match(block, /Reservar este look/);
  assert.match(block, /Book this look/);
});

test("A-06: every shot link gets the block's whole gallery and its own index", async () => {
  const html = render([portfolioNode({ layout: "grid" })], {
    talentPortfolioShots: [
      shot({ id: "g1", offeringId: "off-1" }),
      shot({ id: "g2" }),
      shot({ id: "g3", offeringId: "off-1" }),
    ],
    talentOfferings: [offering()],
    talentOfferingsConfirmsByHand: true,
  });
  const links = html.match(/<button[^>]*data-portfolio-shot-link[^>]*>/g) ?? [];
  assert.equal(links.length, 2);
  assert.match(links[0]!, /data-portfolio-gallery-index="0"/);
  assert.match(links[0]!, /data-portfolio-gallery-size="3"/);
  assert.match(links[1]!, /data-portfolio-gallery-index="2"/);
  assert.match(links[1]!, /data-portfolio-gallery-size="3"/);
  const { buildPortfolioGallery } = await import("./portfolio-lightbox-logic");
  const items = buildPortfolioGallery(
    [shot({ id: "g1", offeringId: "off-1" }), shot({ id: "g2" })],
    (id) => id === "off-1",
    true,
  );
  assert.deepEqual(items.map((i) => [i.id, i.canBook]), [["g1", true], ["g2", false]]);
});

test("TUL-440: every shape taps into the lightbox, linked or not, with or without a caption", () => {
  const shots = [
    shot({ id: "t1", offeringId: "off-1", offeringTitle: "Gel pedicure", caption: "Gel set" }),
    shot({ id: "t2", offeringId: "off-missing", offeringTitle: "Gone" }),
    shot({ id: "t3" }),
  ];
  const shapes: Array<Record<string, unknown>> = [
    { layout: "grid" },
    { layout: "masonry" },
    { layout: "filmstrip" },
    { layout: "contact_sheet" },
    { layout: "chapter" },
    { layout: "staggered", cardStyle: "framed", showCaptions: true },
    { layout: "grid", cardStyle: "framed", showCaptions: true },
    { layout: "grid", linkMode: "none" },
  ];
  for (const props of shapes) {
    const html = render([portfolioNode(props)], { talentPortfolioShots: shots, talentOfferings: [offering()] });
    const buttons = html.match(/<button[^>]*data-portfolio-gallery-index[^>]*>/g) ?? [];
    assert.equal(buttons.length, 3, JSON.stringify(props));
    assert.doesNotMatch(html, /href="#servicios"/, JSON.stringify(props));
    assert.doesNotMatch(html, /<div class="sb-portfolio-shot/, JSON.stringify(props));
    for (const b of buttons) assert.match(b, /aria-label="[^"]+"/);
  }
});

test("TUL-440/TUL-532: framed arrow sits in figcaption beside the lightbox button; unlinked photo gets 'Ver foto N'", () => {
  const html = render(
    [portfolioNode({ layout: "staggered", cardStyle: "framed", showCaptions: true })],
    {
      talentPortfolioShots: [
        shot({ id: "a1", offeringId: "off-1", offeringTitle: "Gel pedicure", caption: "Gel" }),
        shot({ id: "a2" }),
      ],
      talentOfferings: [offering()],
    },
    "es",
  );
  const btn = html.match(/<button[^>]*data-portfolio-shot-link[^>]*>[\s\S]*?<\/button>/)?.[0] ?? "";
  // GRK-044: figcaption (and its arrow) must not nest inside <button>.
  assert.doesNotMatch(btn, /sb-portfolio-arrow|sb-portfolio-cap/);
  assert.match(btn, /data-offering-cta=/);
  assert.match(html, /sb-portfolio-arrow/);
  assert.match(html, /<\/button><figcaption class="sb-portfolio-cap"/);
  assert.match(html, /<button[^>]*aria-label="Ver foto 2: [^"]*"[^>]*data-portfolio-photo/);
});

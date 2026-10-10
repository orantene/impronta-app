/**
 * Release 2.5 "look only": the three new NODE options (`portfolio.cardStyle`,
 * `services_catalog.rowStyle`, `next_free_chip.href`) rendered to static
 * markup. Each is opt-in, so the second half of every test is the control:
 * without the option the markup and stylesheet are exactly the old ones, which
 * is what keeps Folio, Maison, Solace, Mono, Frame and the default design as
 * they were.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import { HeaderDemoPill } from "@/lib/site-admin/sections/site_header/header-site-chrome";
import { EDITORIAL_SOFT_CHROME_CSS } from "@/lib/talent-site/theme-catalog/collection/design-type-system-soft";
import type { TalentOffering } from "@/lib/talent/offerings-types";

import { createBuilderNode } from "./create";
import { safeChipHref } from "./next-free-chip-href";
import { PORTFOLIO_CSS } from "./portfolio-block";
import { PORTFOLIO_FRAMED_CSS } from "./portfolio-framed-css";
import { renderBuilderNodes, type BuilderNodeRenderDataSources } from "./render";
import { SERVICES_CATALOG_ROW_CARD_CSS } from "./services-catalog-row-card-css";
import { validateBuilderNodeTree } from "./validate";
import type { BuilderNode } from "./types";

function render(nodes: BuilderNode[], dataSources: BuilderNodeRenderDataSources = {}, locale?: string): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
      ...(locale ? { visitorLocale: locale } : {}),
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

const HEX = /#[0-9a-fA-F]{6}\b/;

// ── portfolio: framed cards (WK-1..WK-4) ─────────────────────────────────────

const shots = Array.from({ length: 7 }, (_, i) => ({
  id: `shot-${i + 1}`,
  url: `https://example.test/work-${i + 1}.jpg`,
  alt: `Work ${i + 1}`,
  caption: i === 6 ? null : `Design ${i + 1}`,
  offeringId: i === 2 ? null : "off-1",
  offeringTitle: "Gel set",
}));

function portfolio(props: Record<string, unknown> = {}): BuilderNode {
  const base = createBuilderNode("portfolio");
  return { ...base, id: "pf-1", props: { ...base.props, layout: "staggered", showCaptions: true, ...props } } as BuilderNode;
}

test("portfolio cardStyle=framed: framed cards, an arrow named by the service, six tiles, a swipe hint", () => {
  const html = render([portfolio({ cardStyle: "framed", limit: 6 })], { talentPortfolioShots: shots });
  assert.match(html, /data-card-style="framed"/);
  assert.match(html, /sb-portfolio-name/);
  assert.match(html, /sb-portfolio-arrow/);
  // "I want this" is the arrow's accessible name, not visible copy.
  assert.match(html, /<span class="sb-portfolio-sr">I want this<\/span>/);
  assert.equal((html.match(/class="sb-portfolio-item"/g) ?? []).length, 6, "six tiles on the phone strip");
  assert.match(html, /sb-portfolio-hint/);
  assert.match(html, /Swipe to see more/);
  assert.ok(html.includes(PORTFOLIO_FRAMED_CSS), "the framed stylesheet ships with the block");
  // Shot 3 is not linked to a service: it has a name but no arrow (5 of 6 tiles get one).
  assert.equal((html.match(/class="sb-portfolio-arrow"/g) ?? []).length, 5);
});

test("portfolio cardStyle=framed in Spanish: the hint and the arrow name are Spanish", () => {
  const html = render([portfolio({ cardStyle: "framed" })], { talentPortfolioShots: shots }, "es");
  assert.match(html, /Desliza para ver más/);
  assert.match(html, /Quiero esto/);
});

test("TUL-475: framed cards always show a name; phone strip keeps a gutter (no negative margin)", () => {
  const bare = [
    {
      id: "bare-1",
      url: "https://example.test/bare.jpg",
      alt: "",
      caption: null,
      offeringId: null,
      offeringTitle: null,
    },
  ];
  const es = render([portfolio({ cardStyle: "framed", limit: 1 })], { talentPortfolioShots: bare }, "es");
  assert.match(es, /sb-portfolio-name/);
  assert.match(es, /Trabajo 1/);
  const en = render([portfolio({ cardStyle: "framed", limit: 1 })], { talentPortfolioShots: bare });
  assert.match(en, /Work 1/);
  assert.match(PORTFOLIO_CSS, /@media \(max-width:899px\)\{\.sb-portfolio--staggered\{margin:0;padding:0 18px 6px\}\}/);
  assert.doesNotMatch(PORTFOLIO_CSS, /margin:0 -18px/);
});

test("portfolio without cardStyle is exactly the old markup: no framed attribute, stylesheet or hint; five tiles", () => {
  const html = render([portfolio({ limit: 6 })], { talentPortfolioShots: shots });
  assert.doesNotMatch(html, /data-card-style/);
  assert.doesNotMatch(html, /sb-portfolio-arrow|sb-portfolio-hint|sb-portfolio-name/);
  assert.ok(!html.includes(PORTFOLIO_FRAMED_CSS));
  assert.equal((html.match(/class="sb-portfolio-item"/g) ?? []).length, 5, "the staggered cap of five holds for plain portfolios");
});

test("the framed portfolio sheet: lift on hover, arrow fills, no stagger, sixth tile desktop-hidden, edge fade, no hex", () => {
  const css = PORTFOLIO_FRAMED_CSS;
  assert.match(css, /translateY\(-3px\)/);
  assert.match(css, /sb-portfolio-item:hover \.sb-portfolio-arrow\{background:var\(--token-color-accent/);
  assert.match(css, /nth-child\(n\+6\)\{display:none\}/);
  assert.match(css, /nth-child\(2\),[^{]*nth-child\(4\)\{margin-top:0\}/);
  assert.match(css, /mask-image:linear-gradient\(90deg,black 88%,transparent\)/);
  assert.match(css, /aspect-ratio:4\/5/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, HEX);
});

// ── services_catalog: row cards (MN-1..MN-4, MN-9, MN-10) ────────────────────

function offering(partial: Partial<TalentOffering> = {}): TalentOffering {
  return {
    id: "off-1",
    talentProfileId: "talent-1",
    ownerKind: "talent",
    tenantId: null,
    kind: "service",
    title: "Russian manicure",
    description: null,
    priceType: "flat_package",
    priceDisplay: "exact",
    amountCents: 65000,
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
    durationMinutes: 90,
    category: "Nails",
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
    imageUrls: ["https://example.test/manicure.jpg"],
    variants: [],
    addOns: [],
    ...partial,
  } as TalentOffering;
}

function catalog(props: Record<string, unknown> = {}): BuilderNode {
  const base = createBuilderNode("services_catalog");
  return { ...base, id: "cat-1", props: { ...base.props, layout: "rows", columns: 2, ...props } } as BuilderNode;
}

test("services_catalog rowStyle=card: the section says so, the row-card sheet ships, the photo gets a clipped thumb", () => {
  const html = render([catalog({ rowStyle: "card", showPhoto: true })], { talentOfferings: [offering()] });
  assert.match(html, /data-row-style="card"/);
  assert.ok(html.includes(SERVICES_CATALOG_ROW_CARD_CSS), "the row-card stylesheet ships with the block");
  assert.match(html, /site-builder-node--services-catalog-thumb/);
});

test("services_catalog without rowStyle (or with cards / grid layouts) is the old markup and stylesheet", () => {
  for (const props of [{}, { rowStyle: "flat" }, { rowStyle: "card", layout: "cards" }, { rowStyle: "card", layout: "grid" }]) {
    const html = render([catalog(props)], { talentOfferings: [offering()] });
    assert.doesNotMatch(html, /data-row-style/, JSON.stringify(props));
    assert.doesNotMatch(html, /services-catalog-thumb/, JSON.stringify(props));
    assert.ok(!html.includes(SERVICES_CATALOG_ROW_CARD_CSS), JSON.stringify(props));
  }
});

test("the row-card sheet: card chrome, hover lift + zoom + fill, soft pill, accent price, phone and 360 tiers, no hex", () => {
  const css = SERVICES_CATALOG_ROW_CARD_CSS;
  assert.match(css, /border-radius:18px/);
  assert.match(css, /min-height:96px/);
  assert.match(css, /grid-template-columns:76px minmax\(0,1fr\) auto/);
  assert.match(css, /@media \(hover:hover\)\{[^@]*translateY\(-2px\)/);
  assert.match(css, /scale\(1\.08\)/);
  assert.match(css, /:focus-within\{border-color:var\(--token-color-accent/);
  assert.match(css, /column-gap:14px/);
  // Soft pill CTA, selected = accent fill with a check.
  assert.match(css, /cta\{height:auto;min-height:42px[^}]*border-radius:99px;background:var\(--token-color-blush/);
  assert.match(css, /cta\[data-selected="true"\]::before\{content:"\\2713/);
  // Price in the accent, bold.
  assert.match(css, /price\{color:var\(--token-color-accent-text[^}]*font-weight:700/);
  // Phone: 72px thumb spanning two lines, button under the text; 360: 60px thumb, full-width button.
  assert.match(css, /@media \(max-width:899px\)\{[^@]*72px[^@]*grid-row:1 \/ 3/);
  assert.match(css, /@media \(max-width:370px\)\{[^@]*60px[^@]*grid-column:1 \/ -1/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.doesNotMatch(css, HEX);
});

test("row cards: a quote-only service reads 'Por evento' / 'By event'; other catalogs keep 'Por cotización' / 'By quote'", () => {
  const quote = offering({ priceDisplay: "quote", amountCents: null, priceType: "custom", bookingMode: "inquiry" });
  const card = { rowStyle: "card", showModeChip: true };
  assert.match(render([catalog(card)], { talentOfferings: [quote] }, "es"), />Por evento</);
  assert.match(render([catalog(card)], { talentOfferings: [quote] }, "en"), />By event</);
  assert.match(render([catalog({ showModeChip: true })], { talentOfferings: [quote] }, "es"), />Por cotización</);
  assert.match(render([catalog({ showModeChip: true })], { talentOfferings: [quote] }, "en"), />By quote</);
});

test("row cards: the whole row opens the service, the button stays the accessible control, a paused service shows a disabled pill", () => {
  // CatalogRow lives in services-catalog-row.tsx (max-lines split from the filter).
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "services-catalog-row.tsx"), "utf8");
  assert.match(src, /rowCard && !derived\.hidden/);
  assert.match(src, /closest\("button,a"\)/, "a click on the button or a link is not doubled");
  assert.match(src, /data-paused="true"/);
  assert.match(src, /En pausa/);
  assert.match(SERVICES_CATALOG_ROW_CARD_CSS, /cta\[disabled\]\{opacity:\.45/);
  assert.match(SERVICES_CATALOG_ROW_CARD_CSS, /:not\(\[disabled\]\)/, "a paused pill takes no hover fill");
});

// ── header: demo pill (H-5) and the published header height (MN-6) ───────────

test("H-5: the Demo pill renders only for demo profiles", () => {
  assert.equal(renderToStaticMarkup(<HeaderDemoPill show={false} />), "");
  assert.equal(renderToStaticMarkup(<HeaderDemoPill show={undefined} />), "");
  assert.match(renderToStaticMarkup(<HeaderDemoPill show />), /site-header__demo/);
});

test("the header publishes --site-header-h (ResizeObserver, removed on unmount) from the freeform header", () => {
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../sections/site_header");
  const island = readFileSync(resolve(dir, "HeaderHeightVar.tsx"), "utf8");
  assert.match(island, /^"use client";/);
  assert.match(island, /setProperty\("--site-header-h"/);
  assert.match(island, /new ResizeObserver\(publish\)/);
  assert.match(island, /removeProperty\("--site-header-h"\)/);
  assert.match(island, /observer\?\.disconnect\(\)/);
  const header = readFileSync(resolve(dir, "Component.tsx"), "utf8");
  assert.match(header, /<HeaderHeightVar \/>/);
  // The chips and the rail read it, with a fallback so a missing var never breaks the layout.
  assert.match(EDITORIAL_SOFT_CHROME_CSS, /var\(--site-header-h,0px\)/);
});

// ── next_free_chip: href (HE-6) ──────────────────────────────────────────────

test("safeChipHref accepts a same-page anchor or a site path and nothing else", () => {
  assert.equal(safeChipHref("#services"), "#services");
  assert.equal(safeChipHref(" /menu "), "/menu");
  assert.equal(safeChipHref("https://evil.example"), null);
  assert.equal(safeChipHref("javascript:alert(1)"), null);
  assert.equal(safeChipHref("//evil.example"), null);
  assert.equal(safeChipHref(""), null);
  assert.equal(safeChipHref(undefined), null);
});

test("the schema accepts the same hrefs and refuses the rest", () => {
  const ok = (href: string) =>
    validateBuilderNodeTree([{ id: "c1", kind: "next_free_chip", props: { variant: "stacked", href } }]).ok;
  assert.equal(ok("#services"), true);
  assert.equal(ok("/menu"), true);
  assert.equal(ok("https://evil.example"), false);
  assert.equal(ok("javascript:alert(1)"), false);
});

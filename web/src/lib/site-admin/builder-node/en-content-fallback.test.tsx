/**
 * TUL-15: a missing English category name or photo caption never reads as
 * silent Spanish. Category: the platform dictionary. Caption: a language hint.
 */
import { buildPortfolioGallery } from "./portfolio-lightbox-logic";
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { rowToOffering, type TalentOfferingRow } from "@/lib/talent/offerings-types";

import { createBuilderNode } from "./create";
import { renderBuilderNodes, type BuilderNodeContentLocaleOptions } from "./render";
import { captionLanguageHint, captionMapField } from "./portfolio-caption-hint";
import type { TalentPortfolioShot } from "./portfolio-types";
import type { BuilderNode } from "./types";

const EN: BuilderNodeContentLocaleOptions = { locale: "en", defaultLocale: "es", chain: ["es"] };
const ES: BuilderNodeContentLocaleOptions = { locale: "es", defaultLocale: "es", chain: [] };

function render(nodes: BuilderNode[], dataSources: Record<string, unknown>, contentLocale?: BuilderNodeContentLocaleOptions): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
      ...(contentLocale ? { contentLocale } : {}),
    } as Parameters<typeof renderBuilderNodes>[1]) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

function node(kind: "services_catalog" | "portfolio", props: Record<string, unknown>): BuilderNode {
  const base = createBuilderNode(kind);
  return { ...base, id: `${kind}-1`, props: { ...base.props, ...props } } as BuilderNode;
}

// ── (b) category label wired through the loader and the catalog ─────────────

function row(extra: Record<string, unknown>): TalentOfferingRow {
  return {
    id: "r1", talent_profile_id: "t1", owner_kind: "talent", tenant_id: null, kind: "service",
    title: "Clasicas", description: null, price_type: "flat_package", price_display: "exact",
    amount_cents: 1000, currency: "MXN", category: "Pestañas", status: "published",
    visibility: "public", moderation_state: "approved", ...extra,
  } as unknown as TalentOfferingRow;
}

const CATALOG = { categoryNav: "pills", showCategory: true, title: "Servicios" };

test("a Spanish category with no EN overlay renders dictionary English on /en, Spanish on /", () => {
  const en = rowToOffering(row({}), "en", [], ["en"]);
  const es = rowToOffering(row({}), "es", [], ["es"]);
  assert.equal(en.categoryLabel, "Lashes");
  assert.equal(es.categoryLabel, undefined);
  assert.equal(en.category, "Pestañas", "the grouping key stays as written");
  const htmlEn = render([node("services_catalog", CATALOG)], { talentOfferings: [en] }, EN);
  const htmlEs = render([node("services_catalog", CATALOG)], { talentOfferings: [es] }, ES);
  assert.ok(htmlEn.includes("Lashes") && !htmlEn.includes(">Pestañas<"));
  assert.ok(htmlEs.includes("Pestañas") && !htmlEs.includes("Lashes"));
});

test("the talent's own English category wins over the dictionary", () => {
  const en = rowToOffering(row({ category_i18n: { en: "Eyelash studio" } }), "en", [], ["en"]);
  assert.equal(en.categoryLabel, "Eyelash studio");
});

// ── (c) caption hint ────────────────────────────────────────────────────────

const base = { caption: "Extensiones clásicas", captionI18n: null, primaryLocale: "es" } as const;

test("hint on fallback only: English visitor, Spanish-only caption", () => {
  assert.equal(captionLanguageHint({ ...base, locale: "en" }), "Disponible en español");
  assert.equal(
    captionLanguageHint({ caption: "Classic extensions", captionI18n: null, locale: "es", primaryLocale: "en" }),
    "Disponible en inglés",
  );
});

test("no hint when the visitor's language exists, is the primary one, or the caption is empty", () => {
  assert.equal(captionLanguageHint({ ...base, captionI18n: { en: "Classic extensions" }, locale: "en" }), null);
  assert.equal(captionLanguageHint({ ...base, locale: "es" }), null);
  assert.equal(captionLanguageHint({ ...base, caption: "  ", locale: "en" }), null);
  assert.equal(captionLanguageHint({ ...base, caption: null, locale: "en" }), null);
  assert.equal(captionLanguageHint({ ...base, locale: "en", primaryLocale: null }), null);
});

test("captionMapField keeps only non-empty entries", () => {
  assert.deepEqual(captionMapField({ caption_i18n: { en: " Hi ", es: "" } }), { captionI18n: { en: "Hi" } });
  assert.deepEqual(captionMapField({ caption_i18n: {} }), {});
  assert.deepEqual(captionMapField({}), {});
});

function shot(extra: Partial<TalentPortfolioShot>): TalentPortfolioShot {
  return { id: "s1", url: "https://example.test/s1.jpg", alt: "Extensiones clásicas", caption: "Extensiones clásicas", offeringId: null, offeringTitle: null, albumId: null, ...extra };
}

const PORTFOLIO = { showCaptions: true, layout: "grid" };

test("rendered: the hint follows the caption on fallback and the alt stays the plain caption", () => {
  const html = render([node("portfolio", PORTFOLIO)], { talentPortfolioShots: [shot({})] }, EN);
  assert.ok(html.includes("Disponible en español"));
  assert.ok(html.includes('alt="Extensiones clásicas"'));
  assert.ok(!html.includes('alt="Extensiones clásicas Disponible en español"'));
});

test("rendered: galleries whose captions already have the visitor language are byte-identical", () => {
  const withEn = [shot({ caption: "Classic extensions", alt: "Classic extensions", captionI18n: { en: "Classic extensions", es: "Extensiones clásicas" } })];
  const plain = [shot({ caption: "Classic extensions", alt: "Classic extensions" })];
  const a = render([node("portfolio", PORTFOLIO)], { talentPortfolioShots: withEn }, EN);
  assert.ok(!a.includes("sb-portfolio-cap-hint"));
  // Same markup as the shot carrying no map at all when the primary language IS the visitor's.
  const b = render([node("portfolio", PORTFOLIO)], { talentPortfolioShots: plain }, { locale: "en", defaultLocale: "en", chain: [] });
  assert.equal(a.replace(/\s+/g, " "), b.replace(/\s+/g, " "));
  assert.ok(!render([node("portfolio", PORTFOLIO)], { talentPortfolioShots: [shot({})] }, ES).includes("sb-portfolio-cap-hint"));
});

test("rendered: no hint when captions are hidden or empty", () => {
  assert.ok(!render([node("portfolio", { ...PORTFOLIO, showCaptions: false })], { talentPortfolioShots: [shot({})] }, EN).includes("sb-portfolio-cap-hint"));
  assert.ok(!render([node("portfolio", PORTFOLIO)], { talentPortfolioShots: [shot({ caption: null })] }, EN).includes("sb-portfolio-cap-hint"));
});

test("lightbox: the caption and the SAME hint ride on the gallery item; no caption means neither", () => {
  const hint = (s: { id: string; caption?: string | null }) => (s.caption ? "Disponible en español" : null);
  const items = buildPortfolioGallery(
    [
      { id: "a", url: "u1", caption: "Extensiones clásicas" },
      { id: "b", url: "u2", caption: "  " },
    ],
    () => false,
    false,
    hint,
  );
  assert.equal(items[0]!.caption, "Extensiones clásicas");
  assert.equal(items[0]!.captionHint, "Disponible en español");
  assert.equal(items[1]!.caption, undefined);
  assert.equal(items[1]!.captionHint, undefined);
  // no hint function: byte-identical to before for items without a caption hint
  assert.equal(buildPortfolioGallery([{ id: "a", url: "u1", caption: "x" }], () => false, false)[0]!.captionHint, null);
});

test("rendered: the lightbox caption carries the hint on fallback, in the same wording as the grid", () => {
  const html = render([node("portfolio", PORTFOLIO)], { talentPortfolioShots: [shot({})] }, EN);
  assert.ok((html.match(/Disponible en español/g) ?? []).length >= 1);
});

test("TUL-187: work_order (Gridline) captions show Disponible en español on /en fallback", () => {
  const caption = "Cambio de tablero\nOT-0412 · San Pedro · 1 día";
  const html = render(
    [node("portfolio", { showCaptions: true, layout: "work_order" })],
    { talentPortfolioShots: [shot({ caption, alt: "Cambio de tablero" })] },
    EN,
  );
  assert.ok(html.includes("Cambio de tablero"));
  assert.ok(html.includes("OT-0412"));
  assert.ok(html.includes("Disponible en español"));
  assert.ok(html.includes("sb-portfolio-cap-hint"));
  assert.ok(
    !render(
      [node("portfolio", { showCaptions: true, layout: "work_order" })],
      { talentPortfolioShots: [shot({ caption, alt: "Cambio de tablero" })] },
      ES,
    ).includes("Disponible en español"),
  );
});

/**
 * Folio parity (TH02): token-driven type scale, cover statement, comp strip, About as an optional
 * block, one-row phone header, and the release module. Other designs stay as they were.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "@/lib/site-admin/builder-node/create";
import { COMP_CARD_MAGAZINE_CSS } from "@/lib/site-admin/builder-node/comp-card-block";
import { MASTHEAD_MAGAZINE_CSS } from "@/lib/site-admin/builder-node/masthead-block";
import { PORTFOLIO_MAGAZINE_CSS } from "@/lib/site-admin/builder-node/portfolio-block";
import { renderBuilderNodes } from "@/lib/site-admin/builder-node/render";
import { STATEMENT_FOOTER_MAGAZINE_CSS } from "@/lib/site-admin/builder-node/statement-footer-block";
import type { BuilderMastheadNode, BuilderNode } from "@/lib/site-admin/builder-node/types";
import { generateReleaseItems, releaseNotesFor } from "../../theme-releases/release-notes";
import { validateDesign } from "../validate";
import { buildFolioPayload, COLLECTION_DESIGNS } from "./designs";
import { FOLIO_STYLE_TOKEN_DEFAULTS } from "./folio-defaults";
import { MAGAZINE_TYPE_SYSTEM_CSS } from "./design-type-system";

const PINS = {
  editorial: "2c29e6f06863523b", // re-pinned after rebase onto #2527/#2528/#2529 + soft chrome (#2530)
  utility: "d46adc1808b45b81", // re-pinned after the Gridline FAQ heading fix
  highlight: "f6ed134ba4b1cd9e",
  booking: "8f87f1ae1e51bc17",
  // Re-pinned: only added props.i18n (es + en seed copy), see seed-i18n.ts.
  maison: "5d68ebc052e3ef15", // was ff484407b68ec492; TUL-369 Lookbook identity drop + Consultar MODE_DEPENDENT unwind
  // Re-pinned after Gridline contentWidth/full + matrix viewport MQ (#2530), then es + en seed copy.
  gridline: "284229ba182b97e1", // was 3651b5df563fe3b0; TUL-369: SEED_TEXT_ES expanded (EN base + es/en overlays)

};

function kinds(nodes: BuilderNode[]): string[] {
  const out: string[] = [];
  const walk = (n: BuilderNode) => {
    out.push(n.kind);
    const kids = (n as { children?: BuilderNode[] }).children;
    if (Array.isArray(kids)) kids.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

function render(nodes: BuilderNode[]): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, { mode: "freeform", includeRendererStyles: false, includeFontLinks: false, dataSources: {} }),
  );
}

test("type scale defaults are the mockup's, as editable style tokens", () => {
  const t = FOLIO_STYLE_TOKEN_DEFAULTS;
  assert.equal(t["type.hero-size-desktop"], "clamp(84px,19cqi,300px)");
  assert.equal(t["type.section-title-size-desktop"], "64px");
  assert.equal(t["type.group-title-size-desktop"], "56px");
  assert.equal(t["type.footer-title-size-desktop"], "140px");
  assert.equal(t["type.footer-title-size"], "64px");
});

test("the Folio payload validates, About is an optional block, the cover carries the italic line", () => {
  const p = buildFolioPayload();
  assert.deepEqual(validateDesign(p).errors, []);
  assert.ok(!JSON.stringify(p.homeTree).includes(`"slotKey":"about"`), "About is off the default page");
  assert.ok(JSON.stringify(p.optionalBlocks ?? []).includes(`"slotKey":"about"`), "About stays available");
  assert.ok(kinds(p.homeTree).includes("statement_footer"));
  const mast = JSON.stringify(p.homeTree);
  assert.match(mast, /"coverStatement":""/, "the cover line ships neutral; a demo or talent writes it");
});

test("other designs keep their pages (only Maison v2 and Folio ship optional blocks)", () => {
  for (const d of COLLECTION_DESIGNS) {
    if (d.slug === "folio" || d.slug === "maison-v2") continue;
    assert.equal(d.buildPayload().optionalBlocks, undefined, d.slug);
  }
});

test("magazine CSS: desktop sizes come from tokens with the TH02 desktop defaults, no hex", () => {
  for (const css of [MASTHEAD_MAGAZINE_CSS, COMP_CARD_MAGAZINE_CSS, PORTFOLIO_MAGAZINE_CSS, STATEMENT_FOOTER_MAGAZINE_CSS]) {
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  }
  assert.match(MASTHEAD_MAGAZINE_CSS, /var\(--token-type-hero-size-desktop,clamp\(84px,19cqi,300px\)\)/);
  assert.match(PORTFOLIO_MAGAZINE_CSS, /var\(--token-type-group-title-size-desktop,56px\)/);
  assert.match(STATEMENT_FOOTER_MAGAZINE_CSS, /var\(--token-type-footer-title-size-desktop,140px\)/);
  assert.match(MASTHEAD_MAGAZINE_CSS, /aspect-ratio:var\(--sb-mag-cover-aspect-d,4\/3\.4\)/);
});

test("comp strip keeps the TH02 desktop grid and the keyed section is the dark box", () => {
  assert.match(COMP_CARD_MAGAZINE_CSS, /grid-template-columns:260px/);
  assert.match(COMP_CARD_MAGAZINE_CSS, /var\(--token-type-stat-size-desktop,54px\)/);
  assert.match(COMP_CARD_MAGAZINE_CSS, /data-parity-key="comp_card"\]\[data-builder-node-kind="container"\]:has/);
  assert.match(COMP_CARD_MAGAZINE_CSS, /background:var\(--token-color-ink\)/);
});

test("rate card is two columns on desktop with a token title; phone header is one row", () => {
  assert.match(MAGAZINE_TYPE_SYSTEM_CSS, /grid-template-columns:320px/);
  assert.doesNotMatch(MAGAZINE_TYPE_SYSTEM_CSS, /services-catalog-title\{font-size:64px\}/);
  assert.match(MAGAZINE_TYPE_SYSTEM_CSS, /services-catalog-title\{font-size:var\(--token-type-section-title-size-desktop,/);
  assert.match(MAGAZINE_TYPE_SYSTEM_CSS, /\.site-header__inner\{[^}]*flex-wrap:nowrap!important/);
  assert.match(MAGAZINE_TYPE_SYSTEM_CSS, /\.site-header__brand-label\{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/);
});

test("masthead: the cover line renders, and a long name is fitted to the frame", () => {
  const node = createBuilderNode("masthead") as BuilderMastheadNode;
  Object.assign(node.props, {
    edition: "magazine",
    lines: ["Sofía Campos"],
    splitWords: true,
    showCover: true,
    coverSrc: "https://cdn.example/head.jpg",
    coverLine: "Model",
    coverStatement: "Editorial, runway and campaigns.",
  });
  const html = render([node]);
  assert.match(html, /<p>Editorial, runway and campaigns\.<\/p>/);
  assert.match(html, /--sb-fit-m:calc\(\(100cqi - 24px\) \/ 3\.84\)/, "longest word CAMPOS (6 letters)");
  assert.match(html, /--sb-fit-d:calc\(\(100cqi - 64px\) \/ 7\.20\)/, "whole name on one line (12 chars)");
});

test("release: Folio parity has EN/ES notes, About removal is not offered, tokens are noted", () => {
  const to = buildFolioPayload();
  const aboutNode = (to.optionalBlocks ?? [])[0]!;
  const from = {
    ...to,
    homeTree: [...to.homeTree.slice(0, -2), aboutNode, ...to.homeTree.slice(-2)],
    tokenDefaults: { ...to.tokenDefaults, "type.section-title-size": "40px", "type.section-title-size-desktop": "72px" },
  };
  const { items, notes } = generateReleaseItems("folio", { payload: from, version: 15 }, { payload: to, version: 16 });
  assert.ok(notes.en && notes.es);
  assert.ok(!items.some((i) => (i.id ?? "").startsWith("layout:home:about")), "a talent who has About keeps it");
  for (const i of items) assert.ok(i.note?.en && i.note?.es, `missing note for ${i.id}`);
  assert.ok(items.some((i) => i.type === "code"));
  assert.ok(items.some((i) => i.id === "token-default:type.section-title-size-desktop"));
  assert.ok(releaseNotesFor("folio", 16));
  assert.equal(releaseNotesFor("maison-v2", 16)?.design === "folio", false);
});

test("Folio gap fixes: dock stays on rate cards, one-row phone header, uncapped hero name, scoped to magazine", () => {
  const css = MAGAZINE_TYPE_SYSTEM_CSS;
  const M = `[data-theme-canvas-root][data-token-type-system="magazine"]`;
  assert.ok(!/rate_card"\] \.cb-dock/.test(css), "rate-card rules no longer hide the selection dock");
  assert.ok(css.includes(`[data-layout="rate_card"] .site-builder-node--services-catalog-mobile-bar{display:none!important}`));
  assert.ok(css.includes(`${M} .site-header__mobile-panel{display:none!important}`));
  assert.ok(css.includes(`${M} h1.sb-mag-name{font-size:clamp(84px,27cqi,330px)!important}`));
  assert.ok(css.includes(`${M} h1.sb-mag-name{font-size:var(--token-type-hero-size-desktop`) || /h1\.sb-mag-name\{font-size:[^}]*hero-size-desktop[^}]*!important/.test(css));
});

test("Maison v2 and Gridline output is pinned (Folio-only changes leave it byte-identical)", async () => {
  const { createHash } = await import("node:crypto");
  const h = (x: string) => createHash("sha256").update(x).digest("hex").slice(0, 16);
  const mod = await import("./design-type-system");
  const util = await import("./design-type-system-utility");
  const book = await import("./design-type-system-utility-booking");
  const { buildMaisonV2Payload } = await import("./maison-v2");
  const { buildGridlinePayload } = await import("./gridline");
  const got = {
    editorial: h(mod.EDITORIAL_TYPE_SYSTEM_CSS),
    utility: h(util.UTILITY_TYPE_SYSTEM_CSS),
    highlight: h(util.HIGHLIGHT_ACCENT_CSS),
    booking: h(book.UTILITY_BOOKING_CSS),
    maison: h(JSON.stringify(buildMaisonV2Payload())),
    gridline: h(JSON.stringify(buildGridlinePayload())),
  };
  assert.deepEqual(got, PINS);
});

test("release 17: Folio neutral wording has EN/ES notes and every generated item a note", () => {
  const to = buildFolioPayload();
  const from = JSON.parse(
    JSON.stringify(to)
      .replace(/"coverStatement":""/, '"coverStatement":"Editorial, runway and campaigns."')
      .replace(/"Selected work"/g, '"Editorial"')
      .replace(/"More work"/g, '"Runway"'),
  );
  const { items, notes } = generateReleaseItems("folio", { payload: from, version: 16 }, { payload: to, version: 17 });
  assert.ok(notes.en && notes.es);
  assert.ok(releaseNotesFor("folio", 17));
  // `copy` items (P0-2) did not exist when release 17 was hand-annotated; they get auto notes at publish time.
  for (const i of items.filter((x) => x.type !== "copy")) assert.ok(i.note?.en && i.note?.es, `missing note for ${i.id}`);
});

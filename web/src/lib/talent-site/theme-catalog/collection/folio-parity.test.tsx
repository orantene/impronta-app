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
  assert.equal(t["type.hero-size-desktop"], "105px");
  assert.equal(t["type.section-title-size-desktop"], "44px");
  assert.equal(t["type.group-title-size-desktop"], "38px");
  assert.equal(t["type.footer-title-size-desktop"], "64px");
  assert.equal(t["type.footer-title-size"], "64px");
});

test("the Folio payload validates, About is an optional block, the cover carries the italic line", () => {
  const p = buildFolioPayload();
  assert.deepEqual(validateDesign(p).errors, []);
  assert.ok(!JSON.stringify(p.homeTree).includes(`"slotKey":"about"`), "About is off the default page");
  assert.ok(JSON.stringify(p.optionalBlocks ?? []).includes(`"slotKey":"about"`), "About stays available");
  assert.ok(kinds(p.homeTree).includes("statement_footer"));
  const mast = JSON.stringify(p.homeTree);
  assert.match(mast, /"coverStatement":"Editorial, runway and campaigns\."/);
});

test("other designs keep their pages (only Maison v2 and Folio ship optional blocks)", () => {
  for (const d of COLLECTION_DESIGNS) {
    if (d.slug === "folio" || d.slug === "maison-v2") continue;
    assert.equal(d.buildPayload().optionalBlocks, undefined, d.slug);
  }
});

test("magazine CSS: desktop sizes come from tokens, no fixed 273/56/140px scale, no hex", () => {
  for (const css of [MASTHEAD_MAGAZINE_CSS, COMP_CARD_MAGAZINE_CSS, PORTFOLIO_MAGAZINE_CSS, STATEMENT_FOOTER_MAGAZINE_CSS]) {
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
  }
  assert.match(MASTHEAD_MAGAZINE_CSS, /var\(--token-type-hero-size-desktop,105px\)/);
  assert.doesNotMatch(MASTHEAD_MAGAZINE_CSS, /19cqi/);
  assert.match(PORTFOLIO_MAGAZINE_CSS, /var\(--token-type-group-title-size-desktop,38px\)/);
  assert.match(STATEMENT_FOOTER_MAGAZINE_CSS, /var\(--token-type-footer-title-size-desktop,64px\)/);
  assert.doesNotMatch(STATEMENT_FOOTER_MAGAZINE_CSS, /140px/);
  assert.match(MASTHEAD_MAGAZINE_CSS, /aspect-ratio:var\(--sb-mag-cover-aspect-d,3\/4\)/);
});

test("comp strip stays compact at every width and the keyed section is the dark box", () => {
  assert.doesNotMatch(COMP_CARD_MAGAZINE_CSS, /260px/);
  assert.doesNotMatch(COMP_CARD_MAGAZINE_CSS, /font-size:54px/);
  assert.match(COMP_CARD_MAGAZINE_CSS, /data-parity-key="comp_card"\]\[data-builder-node-kind="container"\]:has/);
  assert.match(COMP_CARD_MAGAZINE_CSS, /background:var\(--token-color-ink\)/);
});

test("rate card stays stacked on desktop and its title is a token; phone header is one row", () => {
  assert.doesNotMatch(MAGAZINE_TYPE_SYSTEM_CSS, /grid-template-columns:320px/);
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
  const { items, notes } = generateReleaseItems("folio", { payload: from, version: 3 }, { payload: to, version: 4 });
  assert.ok(notes.en && notes.es);
  assert.ok(!items.some((i) => (i.id ?? "").startsWith("layout:home:about")), "a talent who has About keeps it");
  for (const i of items) assert.ok(i.note?.en && i.note?.es, `missing note for ${i.id}`);
  assert.ok(items.some((i) => i.type === "code"));
  assert.ok(items.some((i) => i.id === "token-default:type.section-title-size-desktop"));
  assert.equal(releaseNotesFor("maison-v2", 99), null, "the unpinned Folio module never leaks to other designs");
});

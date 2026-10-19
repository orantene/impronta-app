/**
 * Frame golden / fidelity (port of owner original TH08-Frame, 1440px).
 * Pins what was read off the screenshot so a regression fails CI before QA.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { designTokenDefaults } from "./design-token-defaults";
import { COLLECTION_DESIGNS, COLLECTION_DESIGN_GAPS } from "./designs";
import { FRAME_HEADING_FONT, FRAME_LABEL_FONT, FRAME_PALETTE, FRAME_STYLE_TOKEN_DEFAULTS } from "./frame-defaults";
import { frameDarkHero } from "./frame-hero";
import { getGalleryDesign } from "../gallery-meta";

type N = { kind?: string; props?: Record<string, unknown>; children?: N[] };
const find = (nodes: N[], pred: (n: N) => boolean): N | null => {
  for (const n of nodes) {
    if (pred(n)) return n;
    const hit = find(n.children ?? [], pred);
    if (hit) return hit;
  }
  return null;
};

const payload = () => COLLECTION_DESIGNS.find((d) => d.slug === "frame")!.buildPayload();

describe("frame golden (TH08)", () => {
  it("W-12 gap is closed", () => {
    assert.deepEqual(COLLECTION_DESIGN_GAPS.frame, []);
  });
  it("header is a flat solid bar (TH08), filter bar nav", () => {
    assert.match(JSON.stringify(payload().shellTree), /"tone":"solid"/);
  });
  it("header is the filter bar with Spanish-capable nav", () => {
    assert.match(JSON.stringify(payload().shellTree), /"navChrome":"filter_bar"/);
  });
  it("contact sheet: 4 columns, captions, tag filter on, 16 frames", () => {
    const p = find(payload().homeTree as unknown as N[], (n) => n.kind === "portfolio")!;
    assert.equal(p.props!.layout, "contact_sheet");
    assert.equal(p.props!.columns, 4);
    assert.equal(p.props!.showCaptions, true);
    assert.equal(p.props!.tagFilter, true);
    assert.equal(p.props!.limit, 16);
  });
  it("hero is the one dark panel: ink ground, page-coloured text, tokens only", () => {
    const hero = (payload().homeTree as unknown as N[])[0]!;
    const s = hero.props!.style as Record<string, unknown>;
    assert.equal(s.backgroundColor, "token:color.ink");
    assert.equal(s.textColor, "token:color.background");
    const json = JSON.stringify(hero);
    assert.doesNotMatch(json, /#[0-9a-fA-F]{6}/, "no literal hex in the hero");
    const heading = find(hero.children ?? [], (n) => n.kind === "heading")!;
    assert.equal((heading.props!.style as Record<string, unknown>).textTransform, "uppercase");
  });
  it("frameDarkHero lifts muted text off the dark ground", () => {
    const out = frameDarkHero({ id: "h", kind: "container", props: {}, children: [{ id: "p", kind: "paragraph", props: { text: "x", style: { tone: "muted" } } }] } as never) as unknown as N;
    const style = out.children![0]!.props!.style as Record<string, unknown>;
    assert.equal(style.tone, undefined);
    assert.equal(style.textColor, "token:color.background");
  });
  it("design defaults: square, mono labels, bold display; all registered under the slug", () => {
    const d = designTokenDefaults("frame");
    assert.equal(d["button.radius"], "0px");
    assert.equal(d["radius.scale-preset"], "sharp");
    assert.equal(d["shell.header-nav-font"], FRAME_LABEL_FONT);
    for (const [k, v] of Object.entries(FRAME_STYLE_TOKEN_DEFAULTS)) assert.equal(payload().tokenDefaults?.[k], v);
  });
  it("gallery look: Plex Condensed heading, red accent on the warm grey page", () => {
    const g = getGalleryDesign("frame")!;
    assert.equal(g.fonts?.heading, FRAME_HEADING_FONT);
    assert.match(FRAME_HEADING_FONT, /IBM Plex Sans Condensed/);
    const pal = g.palettes[0]!;
    assert.equal(pal.page.toUpperCase(), FRAME_PALETTE.page);
    assert.equal(pal.accent.toUpperCase(), FRAME_PALETTE.accent);
  });
  it("services band keeps its eligibility-bearing section and booking CTA", () => {
    const home = JSON.stringify(payload().homeTree);
    assert.match(home, /"sectionTypeKey":"services"|"slotKey":"services"/);
    assert.match(home, /Sessions and prices/);
  });
});

/**
 * Solace golden / fidelity (port of owner original TH04-Solace, 1440px).
 * W-10 rotating word in the hero, ES+EN, palette read off the screenshot.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getGalleryDesign } from "../gallery-meta";
import { COLLECTION_DESIGNS, COLLECTION_DESIGN_GAPS } from "./designs";
import { SOLACE_HERO_HEADLINE, SOLACE_ROTATING_WORDS } from "./solace-hero";

type N = { kind?: string; props?: Record<string, unknown>; children?: N[] };
const find = (nodes: N[], pred: (n: N) => boolean): N | null => {
  for (const n of nodes) {
    if (pred(n)) return n;
    const hit = find(n.children ?? [], pred);
    if (hit) return hit;
  }
  return null;
};
const payload = () => COLLECTION_DESIGNS.find((d) => d.slug === "solace")!.buildPayload();
const heroHeading = () => find(payload().homeTree as unknown as N[], (n) => n.kind === "heading" && n.props?.level === 1)!;

describe("solace golden (TH04)", () => {
  it("W-10 gap is closed; only the studio/villa toggle (O4 follow-up) remains", () => {
    assert.deepEqual(COLLECTION_DESIGN_GAPS.solace, ["studio/villa hero toggle (app)"]);
  });
  it("hero headline rotates talent-authored words", () => {
    const h = heroHeading();
    assert.equal(h.props!.text, SOLACE_HERO_HEADLINE);
    assert.deepEqual((h.props!.rotatingWords as { text: string }[]).map((w) => w.text), [...SOLACE_ROTATING_WORDS]);
    assert.ok((h.props!.rotateMs as number) >= 1500);
  });
  it("hero keeps its light display weight (editable style, not hard-coded font)", () => {
    const style = heroHeading().props!.style as Record<string, unknown>;
    assert.equal(style.fontWeight, 300);
    assert.doesNotMatch(JSON.stringify(style), /Cormorant|serif/);
  });
  it("ES + EN: Spanish headline and every word ship in the seed overlay, no English on a Spanish site", () => {
    const h = heroHeading();
    const es = (h.props!.i18n as { es: Record<string, string>; en: Record<string, string> }).es;
    const en = (h.props!.i18n as { es: Record<string, string>; en: Record<string, string> }).en;
    assert.equal(es.text, "Una hora para {rotate}");
    assert.deepEqual([es["rotatingWords.0.text"], es["rotatingWords.1.text"], es["rotatingWords.2.text"]], ["soltar", "respirar", "descansar"]);
    assert.equal(en["rotatingWords.0.text"], "let go");
  });
  it("palette: warm linen page with the moss accent", () => {
    const pal = getGalleryDesign("solace")!.palettes[0]!;
    assert.equal(pal.page.toUpperCase(), "#EDE9E1");
    assert.equal(pal.accent.toUpperCase(), "#3E4A3A");
  });
  it("services band and booking CTA stay in the tree", () => {
    const json = JSON.stringify(payload().homeTree);
    assert.match(json, /"slotKey":"services"|"sectionTypeKey":"services"/);
    assert.match(json, /Ask a question|Book|Write me/);
  });
});

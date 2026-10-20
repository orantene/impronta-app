/**
 * Mono golden / fidelity (port of owner original TH20-Mono, 1440px).
 * The no-nav header, Manrope + teal, left-aligned display hero.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NAV_CHROME_STYLES, isNavChromeStyle } from "@/lib/site-admin/nav-chrome";
import { headerItemMobileResolved } from "@/lib/site-admin/sections/site_header/header-site-chrome";
import { getGalleryDesign } from "../gallery-meta";
import { designTokenDefaults } from "./design-token-defaults";
import { COLLECTION_DESIGNS, COLLECTION_DESIGN_GAPS } from "./designs";
import { MONO_HEADING_FONT, MONO_PALETTE, MONO_STYLE_TOKEN_DEFAULTS } from "./mono-defaults";

type N = { kind?: string; props?: Record<string, unknown>; children?: N[] };
const find = (nodes: N[], pred: (n: N) => boolean): N | null => {
  for (const n of nodes) {
    if (pred(n)) return n;
    const hit = find(n.children ?? [], pred);
    if (hit) return hit;
  }
  return null;
};
const payload = () => COLLECTION_DESIGNS.find((d) => d.slug === "mono")!.buildPayload();

describe("mono golden (TH20)", () => {
  it("no_nav is a real shared header mode", () => {
    assert.ok(isNavChromeStyle("no_nav"));
    assert.ok(NAV_CHROME_STYLES.includes("no_nav"));
  });
  it("the no-nav header gap is closed; only the inline slot picker (app) remains", () => {
    assert.deepEqual(COLLECTION_DESIGN_GAPS.mono, ["inline 3-tap slot picker (app)"]);
  });
  it("header: no link strip, no nav node, keeps the wordmark and the booking CTA", () => {
    const shell = payload().shellTree as unknown as N[];
    const json = JSON.stringify(shell);
    assert.doesNotMatch(json, /"kind":"nav"/);
    assert.match(json, /"navChrome":"no_nav"|"navItems":\[\]/);
    assert.ok(find(shell, (n) => n.kind === "button" || /"cta"/.test(JSON.stringify(n))), "booking CTA stays");
  });
  it("390: nothing folds into a hamburger; the CTA stays in the bar", () => {
    const header = find(payload().shellTree as unknown as N[], (n) => n.props?.sectionTypeKey === "site_header")!;
    const regions = (header.props!.sectionProps as { regions: Record<string, Array<{ type: string; responsive?: { mobile?: string } }>> }).regions;
    const items = [...regions.left, ...regions.center, ...regions.right];
    assert.ok(items.every((i) => i.type !== "nav"), "no nav item");
    assert.ok(items.every((i) => headerItemMobileResolved(i as never) !== "menu"), "no item folds into the burger");
    assert.equal(headerItemMobileResolved(items.find((i) => i.type === "cta") as never), "show");
  });
  it("header is a flat solid bar, not a transparent gradient over the hero (TH20)", () => {
    assert.match(JSON.stringify(payload().shellTree), /"tone":"solid"/);
  });
  it("hero: left aligned, wide, display weight 800, tokens only", () => {
    const hero = (payload().homeTree as unknown as N[])[0]!;
    const json = JSON.stringify(hero);
    assert.doesNotMatch(json, /"align":"center"/);
    assert.doesNotMatch(json, /#[0-9a-fA-F]{6}/);
    const h = find([hero], (n) => n.kind === "heading")!;
    assert.equal((h.props!.style as Record<string, unknown>).fontWeight, 800);
  });
  it("services stay a compact searchable price list (eligibility-bearing band kept)", () => {
    const json = JSON.stringify(payload().homeTree);
    assert.match(json, /"layout":"compact_list"/);
  });
  it("defaults: pill buttons, Manrope, teal accent; registered under the slug", () => {
    const d = designTokenDefaults("mono");
    assert.equal(d["button.radius"], "999px");
    assert.equal(d["radius.scale-preset"], "pill");
    for (const [k, v] of Object.entries(MONO_STYLE_TOKEN_DEFAULTS)) assert.equal(payload().tokenDefaults?.[k], v);
    const g = getGalleryDesign("mono")!;
    assert.equal(g.fonts?.heading, MONO_HEADING_FONT);
    assert.equal(g.palettes[0]!.accent.toUpperCase(), MONO_PALETTE.accent);
  });
});

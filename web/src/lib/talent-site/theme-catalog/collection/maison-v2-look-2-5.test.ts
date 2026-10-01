/**
 * Release 2.5 "look only", item by item (gap report section 2 and 3).
 *
 * The look is two sheets and one payload:
 *   - the SOFT CHROME sheet (`design-type-system-soft.ts`), switched on by the
 *     `shape.chrome` token, which only Maison v2 sets;
 *   - the MOTION sheet (`motion-css.ts`), one reduced-motion rule for every talent surface;
 *   - the Maison v2 payload (rhythm, ticker, framed cards, row cards, About
 *     actions, hero chip link, nav).
 * Node-level options are covered by `maison-v2-look-2-5.render.test.tsx`; the
 * v18 to v19 classification by `theme-releases/maison-v2-releases.test.ts`.
 * These are static checks: no browser, so "looks right" is for the integrator.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { CATALOG_BOOKING_CSS } from "@/components/public-booking/catalog-booking-styles";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { designTokensToCssVars, designTokensToDataAttrs } from "@/lib/site-admin/tokens/resolve";
import { STYLE_TOKEN_BY_KEY, styleTokenValidator } from "@/lib/site-admin/tokens/style-tokens";
import type { DesignPayload } from "../types";
import { EDITORIAL_TYPE_SYSTEM_CSS, MAGAZINE_TYPE_SYSTEM_CSS } from "./design-type-system";
import { EDITORIAL_SOFT_CHROME_CSS } from "./design-type-system-soft";
import {
  buildFolioPayload,
  buildFramePayload,
  buildMaisonV2Payload,
  buildMonoPayload,
  buildSolacePayload,
} from "./designs";
import { MOTION_CSS, MOTION_EASE_PANEL, MOTION_KEYFRAMES_CSS, MOTION_REDUCED_CSS, MOTION_SOFT_CSS, MOTION_SURFACES } from "./motion-css";

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const soft = EDITORIAL_SOFT_CHROME_CSS;

function walk(nodes: ReadonlyArray<BuilderNode>, visit: (n: BuilderNode) => void): void {
  for (const n of nodes) {
    visit(n);
    walk(((n as { children?: BuilderNode[] }).children ?? []) as BuilderNode[], visit);
  }
}
const propsOf = (n: BuilderNode) => n.props as Record<string, unknown>;
function find(tree: ReadonlyArray<BuilderNode>, pred: (n: BuilderNode) => boolean): BuilderNode | undefined {
  let hit: BuilderNode | undefined;
  walk(tree, (n) => {
    if (!hit && pred(n)) hit = n;
  });
  return hit;
}
const slot = (tree: ReadonlyArray<BuilderNode>, key: string) => find(tree, (n) => propsOf(n).slotKey === key)!;
const styleOf = (n: BuilderNode) => (propsOf(n).style ?? {}) as Record<string, unknown>;

// ── the switch ───────────────────────────────────────────────────────────────

test("shape.chrome is a real style token: enum soft / flat, projects as a data attribute, Maison v2 sets soft", () => {
  const def = STYLE_TOKEN_BY_KEY.get("shape.chrome")!;
  assert.ok(def, "registered");
  assert.equal(def.fallback, "flat", "a site with no value keeps the flat look");
  assert.deepEqual(def.options!.map((o) => o.value), ["soft", "flat"]);
  for (const o of def.options!) assert.ok(o.en && o.es, "EN + ES option labels");
  assert.ok(def.label.en && def.label.es);
  assert.ok(styleTokenValidator(def).safeParse("soft").success);
  assert.equal(designTokensToDataAttrs({ "shape.chrome": "soft" })["data-token-shape-chrome"], "soft");
  assert.equal(buildMaisonV2Payload().tokenDefaults!["shape.chrome"], "soft");
  assert.equal(designTokensToCssVars({ "shape.chrome": "soft" })["--token-shape-chrome"], undefined, "an attribute, not a var");
});

test("every soft rule is scoped to the soft chrome (or is the anchor-scroll sheet); nothing leaks to other systems", () => {
  const rules = soft.split("\n");
  for (const rule of rules) {
    assert.ok(
      rule.includes('data-token-shape-chrome="soft"'),
      `unscoped soft rule: ${rule.slice(0, 120)}`,
    );
  }
  assert.doesNotMatch(soft, HEX);
  assert.doesNotMatch(soft, /maison/i);
  // The base editorial sheet carries the soft sheet LAST, so equal-scope ties go to it.
  assert.ok(EDITORIAL_TYPE_SYSTEM_CSS.endsWith(soft));
  // Folio's magazine system has no soft rules.
  assert.ok(!MAGAZINE_TYPE_SYSTEM_CSS.includes("shape-chrome"));
});

// ── header (H-1, H-2, H-3) ───────────────────────────────────────────────────

test("H-1 H-2: the logo is a column with the trade tight underneath; the bar is frosted on the raised surface", () => {
  assert.match(soft, /\.site-header__brand\{flex-direction:column;align-items:flex-start;gap:0\}/);
  assert.match(soft, /\.site-header__brand-label\{line-height:\.95\}/);
  assert.match(soft, /\.site-header__brand-tagline\{margin-top:-1px;font-size:9px;letter-spacing:\.24em\}/);
  assert.match(soft, /\.site-header\{background:color-mix\(in srgb,var\(--token-color-surface-raised,var\(--token-color-background\)\) 92%/);
  const t = buildMaisonV2Payload().tokenDefaults!;
  assert.equal(t["layout.header-pad-y-phone"], "6px");
  assert.equal(t["layout.header-pad-y"], "18px");
});

test("H-3: the header has the mockup's five links; H-5: the demo pill is not in the payload and only paints for demo profiles", () => {
  const header = buildMaisonV2Payload().shellTree.find((n) => propsOf(n).slotKey === "header")!;
  const links = (propsOf(header).sectionProps as { navItems: Array<{ label: string; href: string }> }).navItems;
  assert.deepEqual(links.map((l) => l.label), ["Work", "Menu and prices", "Reviews", "About", "Location"]);
  assert.deepEqual(links.map((l) => l.href), ["#gallery", "#services", "#reviews", "#about", "#location"]);
  assert.doesNotMatch(JSON.stringify(header), /demo/i);
});

// ── section rhythm (G-2) ─────────────────────────────────────────────────────

test("G-2: sections have 88px / 48px bands, the ticker, menu and About sit on the raised surface, the rest on the page", () => {
  const home = buildMaisonV2Payload().homeTree;
  const surface = "token:color.surface-raised";
  for (const key of ["reviews", "before_after", "aftercare", "location", "contact"]) {
    const s = styleOf(slot(home, key));
    assert.equal(s.paddingTop, "88px", key);
    assert.equal(s.paddingBottom, "88px", key);
    assert.equal((s.responsive as { mobile: Record<string, string> }).mobile.paddingTop, "48px", key);
    assert.equal((s.responsive as { mobile: Record<string, string> }).mobile.paddingBottom, "48px", key);
    assert.equal(s.backgroundColor, undefined, `${key} sits on the page colour`);
  }
  for (const key of ["services", "about"]) {
    assert.equal(styleOf(slot(home, key)).backgroundColor, surface, `${key} is a raised band`);
    assert.equal(styleOf(slot(home, key)).paddingTop, "88px");
  }
  const ticker = find(home, (n) => n.kind === "marquee")!;
  assert.equal(styleOf(ticker).backgroundColor, surface);
  const work = find(home, (n) => n.kind === "portfolio")!;
  assert.equal(styleOf(work).backgroundColor, undefined, "work sits on the page colour");
  assert.equal(styleOf(work).paddingTop, "88px");
  const tokens = buildMaisonV2Payload().tokenDefaults!;
  assert.deepEqual(
    [tokens["layout.section-pad-top"], tokens["layout.section-pad-bottom"], tokens["layout.section-pad-top-phone"], tokens["layout.section-pad-bottom-phone"]],
    ["88px", "88px", "48px", "48px"],
  );
});

// ── ticker (TK-1) ────────────────────────────────────────────────────────────

test("TK-1: the ticker loops in 38s (medium only), sits 40px below the hero (26px on phones) with 16px inside its hairlines", () => {
  assert.match(soft, /marquee\[data-bn-marquee-speed="medium"\]\{--bn-marquee-duration:38s\}/);
  assert.doesNotMatch(soft, /marquee\[data-bn-marquee-speed="(slow|fast)"\]/, "slow and fast stay the talent's choice");
  const ticker = find(buildMaisonV2Payload().homeTree, (n) => n.kind === "marquee")!;
  const s = styleOf(ticker);
  assert.equal(s.marginTopFree, "40px");
  assert.equal((s.responsive as { mobile: Record<string, string> }).mobile.marginTopFree, "26px");
  assert.equal(s.paddingTop, "16px");
  assert.equal(s.paddingBottom, "16px");
  assert.equal(propsOf(ticker).speed, "medium");
});

// ── hero (HE-2, HE-3, HE-6, HE-7) ────────────────────────────────────────────

test("HE-2 HE-3 HE-6 HE-7: eyebrow = trade + city, proof line token, chip links to the menu, ghost button has a fill", () => {
  const hero = slot(buildMaisonV2Payload().homeTree, "hero");
  const texts: string[] = [];
  walk([hero], (n) => {
    if (n.kind === "paragraph") texts.push(String(propsOf(n).text));
  });
  assert.ok(texts.includes("{{heroEyebrow}}"), "eyebrow");
  assert.ok(texts.includes("{{proofLine}}"), "proof line");
  assert.ok(!texts.includes("{{locationLine}}"), "the old proof line content is gone");
  const chip = find([hero], (n) => n.kind === "next_free_chip")!;
  assert.equal(propsOf(chip).href, "#services");
  assert.equal(propsOf(chip).variant, "stacked");
  assert.match(soft, /button\[data-builder-button-tone="secondary"\],\.site-builder-node--button-secondary\)\{background:var\(--token-color-surface-raised/);
  assert.match(soft, /#hero \.site-builder-node--container \+ p\.site-builder-node--paragraph\.site-builder-node--paragraph\{font-size:13px\}/);
});

// ── work (WK-1..WK-4) ────────────────────────────────────────────────────────

test("WK-1..WK-4 payload: framed cards with captions, six tiles", () => {
  const work = find(buildMaisonV2Payload().homeTree, (n) => n.kind === "portfolio")!;
  assert.equal(propsOf(work).cardStyle, "framed");
  assert.equal(propsOf(work).showCaptions, true);
  assert.equal(propsOf(work).limit, 6);
  assert.equal(propsOf(work).layout, "staggered");
});

// ── menu (MN-1..MN-10) ───────────────────────────────────────────────────────

test("MN-1..MN-4 payload: rows as cards in two columns under their own key, soft pill from the row-card sheet", () => {
  const catalog = find(buildMaisonV2Payload().homeTree, (n) => n.kind === "services_catalog")!;
  const p = propsOf(catalog);
  assert.equal(p.slotKey, "services_row_cards");
  assert.equal(p.layout, "rows");
  assert.equal(p.rowStyle, "card");
  assert.equal(p.columns, 2);
  assert.equal(p.pricePlacement, "meta");
  assert.equal(p.showModeChip, true);
  assert.equal(p.categoryNav, "rail");
});

test("MN-6 MN-7 MN-8: sticky phone chips under the header, desktop rail below it with an accent active chip, heading rule", () => {
  assert.match(soft, /@media \(max-width:767px\)\{[^@]*nav\{position:sticky;top:calc\(var\(--site-header-h,0px\) - 1px\)/);
  assert.match(soft, /backdrop-filter:blur\(10px\)/);
  assert.match(soft, /@media \(min-width:900px\)\{[^@]*nav\{top:calc\(var\(--site-header-h,72px\) \+ 24px\)\}/);
  assert.match(soft, /pill\[data-active="true"\]\{background:var\(--token-color-accent/);
  assert.match(soft, /group-title\{margin:26px 0 14px;padding-bottom:10px;border-bottom:var\(--token-shape-rule-width,1px\) solid var\(--token-color-line\)\}/);
});

// ── FAQ (FQ-1) ───────────────────────────────────────────────────────────────

test("FQ-1: each question is a raised card, '+' in a 32px tint circle that turns 45 degrees, two columns on desktop", () => {
  assert.match(soft, /accordion-item\{background:var\(--token-color-surface-raised[^}]*border-radius:18px!important;padding:0 20px!important/);
  assert.match(soft, /summary\{align-items:center;min-height:64px;font-size:16px\}/);
  assert.match(soft, /summary::after\{[^}]*width:32px;height:32px;border-radius:50%;background:var\(--token-color-blush/);
  assert.match(soft, /\[open\] > summary::after\{content:"\+";transform:rotate\(45deg\)\}/);
  assert.match(soft, /accordion\{grid-template-columns:1fr 1fr!important/);
  assert.match(soft, /\[open\]\{box-shadow:0 14px 30px -22px/);
  const faq = slot(buildMaisonV2Payload().homeTree, "contact");
  assert.equal(styleOf(faq).maxWidthFree, undefined, "no 856px column: two columns need the width");
});

// ── reviews (RV-2, RV-3) ─────────────────────────────────────────────────────

test("RV-2 RV-3: no hairline on the card, 84% slides with an edge fade on phones, three cards and no arrows on desktop", () => {
  assert.match(soft, /sb-reviews-card\[data-accent\]\{border-color:transparent/);
  assert.match(soft, /carousel-slide\{flex-basis:84%\}/);
  assert.match(soft, /mask-image:linear-gradient\(90deg,black 88%,transparent\)/);
  assert.match(soft, /carousel-controls\{display:none\}/);
  assert.match(soft, /carousel-slide:nth-child\(n\+4\)\{display:none\}/);
});

// ── About (AB-1) ─────────────────────────────────────────────────────────────

test("AB-1: 'See services' + 'Write me' (opens the chat) under the About copy, keyed so it is an opt-in layout item", () => {
  const about = slot(buildMaisonV2Payload().homeTree, "about");
  const actions = find([about], (n) => propsOf(n).slotKey === "about_actions")!;
  assert.ok(actions);
  const buttons = ((actions as { children: BuilderNode[] }).children).map((b) => propsOf(b));
  assert.deepEqual(buttons.map((b) => [b.label, b.href, b.tone]), [
    ["See services", "#services", "primary"],
    ["Write me", "#talent-ask", "secondary"],
  ]);
  assert.match(soft, /#about \.site-builder-node--button\[data-builder-button-tone="secondary"\]\{[^}]*text-decoration:underline/);
});

// ── the 360px tier (G-1) ─────────────────────────────────────────────────────

test("G-1: a 360px tier tightens the hero and section titles (41px / 30px)", () => {
  assert.match(soft, /@media \(max-width:370px\)\{[^@]*#hero h1\{font-size:41px\}[^@]*h2\{font-size:30px\}/);
});

// ── text-safe accent (PL-2) ──────────────────────────────────────────────────

test("PL-2: accent words, eyebrows and tinted chips read the text-safe accent, never the raw one", () => {
  assert.match(soft, /h1,h2,h3\) em\{color:var\(--token-color-accent-text,var\(--token-color-accent/);
  assert.match(soft, /sb-reviews-initials\{background:var\(--token-color-blush[^}]*color:var\(--token-color-accent-text/);
});

// ── motion (section 3, G-7) ──────────────────────────────────────────────────

test("motion: the keyframes and easings of section 3", () => {
  assert.equal(MOTION_EASE_PANEL, "cubic-bezier(.2,.8,.2,1)");
  const css = MOTION_KEYFRAMES_CSS.join("\n");
  assert.match(css, /@keyframes tl-rise\{from\{transform:translateY\(40px\);opacity:\.4\}to\{transform:none;opacity:1\}\}/);
  assert.match(css, /@keyframes tl-spin\{to\{transform:rotate\(360deg\)\}\}/);
  assert.match(css, /animation:tl-spin 1s linear infinite/);
});

test("motion: ONE reduced-motion rule covers the canvas, the sheet and scrim, the dock and the chat; keeps focus rings", () => {
  const rule = MOTION_REDUCED_CSS.join("\n");
  assert.equal(MOTION_REDUCED_CSS.length, 1);
  assert.match(rule, /^@media \(prefers-reduced-motion:reduce\)\{/);
  for (const surface of MOTION_SURFACES) assert.ok(rule.includes(surface), surface);
  for (const s of ["[data-theme-canvas-root]", ".jb-back", ".jb-sheet", ".cb-dock", "[data-tl-motion]"]) assert.ok(rule.includes(s), s);
  assert.match(rule, /animation:none!important;transition:none!important;scroll-behavior:auto!important/);
  assert.doesNotMatch(rule, /outline/, "focus rings are untouched");
  assert.ok(MOTION_CSS.join("\n").includes(rule));
});

test("motion: smooth anchor scroll only when motion is welcome, with a header-aware offset", () => {
  const css = MOTION_SOFT_CSS.join("\n");
  assert.match(css, /@media \(prefers-reduced-motion:no-preference\)\{html:has\([^)]*shape-chrome="soft"\][^)]*\)[^{]*\{scroll-behavior:smooth\}/);
  assert.match(css, /scroll-margin-top:calc\(var\(--site-header-h,0px\) \+ 8px\)/);
  for (const id of ["#hero", "#gallery", "#services", "#reviews", "#about", "#contact", "#visit", "#location"]) assert.ok(css.includes(id), id);
  assert.doesNotMatch(css, HEX);
});

test("motion: the booking sheet, scrim, chat panel and busy ring take the mockup's values on soft sites only", () => {
  const css = MOTION_SOFT_CSS.join("\n");
  // A-7 scrim .2s ease, A-8 sheet .28s in the house easing, rising from tl-rise (40px, 40%).
  assert.match(css, /\.jb-back\{animation-duration:\.2s;animation-timing-function:ease\}/);
  assert.match(css, /\.jb-sheet\{animation-name:tl-rise;animation-duration:\.28s;animation-timing-function:cubic-bezier\(\.2,\.8,\.2,1\)\}/);
  // A-10 chat panel .25s.
  assert.match(css, /\[data-tl-motion\]\{animation:tl-rise \.25s cubic-bezier\(\.2,\.8,\.2,1\)\}/);
  // The timings only apply when motion is welcome, and only with the soft chrome.
  for (const line of MOTION_SOFT_CSS.filter((l) => /jb-back|jb-sheet|data-tl-motion/.test(l))) {
    assert.match(line, /prefers-reduced-motion:no-preference/);
    assert.match(line, /data-token-shape-chrome="soft"/);
  }
  // A-14: the ring is hidden by the platform sheet and turned on by the soft chrome.
  assert.match(css, /\.cb-spinner\{display:inline-block\}/);
  assert.match(CATALOG_BOOKING_CSS, /\.cb-spinner\{display:none;/);
  assert.match(CATALOG_BOOKING_CSS, /animation:cb-spin 1s linear infinite/);
  // The platform's own sheet motion is untouched for every other design.
  assert.match(CATALOG_BOOKING_CSS, /animation:jb-fade 200ms cubic-bezier\(\.22,1,\.36,1\)/);
  assert.match(CATALOG_BOOKING_CSS, /animation:jb-rise 300ms cubic-bezier\(\.22,1,\.36,1\)/);
  // The chat panel is marked, and carries no inline animation of its own.
  const chat = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../../app/t/[profileCode]/_chat/CardDockFrame.tsx"), "utf8");
  assert.match(chat, /data-tl-motion=""/);
  assert.doesNotMatch(chat, /tl-rise/);
});

test("motion: the always-on sheet has no colours and no hex", () => {
  assert.doesNotMatch(MOTION_CSS.join("\n"), HEX);
});

// ── other designs are untouched ──────────────────────────────────────────────

test("Folio, Solace, Mono and Frame payloads carry none of the 2.5 options, tokens or tokens-in-text", () => {
  const others: Array<[string, DesignPayload]> = [
    ["folio", buildFolioPayload()],
    ["solace", buildSolacePayload()],
    ["mono", buildMonoPayload()],
    ["frame", buildFramePayload()],
  ];
  for (const [name, payload] of others) {
    const json = JSON.stringify(payload);
    for (const needle of ["cardStyle", "rowStyle", "shape.chrome", "{{heroEyebrow}}", "{{proofLine}}", "about_actions", "services_row_cards"]) {
      assert.ok(!json.includes(needle), `${name} must not carry ${needle}`);
    }
    assert.equal(payload.tokenDefaults?.["shape.chrome"], undefined, name);
    // A node-level href on the chip is Maison v2's alone.
    walk([...payload.shellTree, ...payload.homeTree], (n) => {
      if (n.kind === "next_free_chip") assert.equal(propsOf(n).href, undefined, `${name} chip`);
    });
  }
});

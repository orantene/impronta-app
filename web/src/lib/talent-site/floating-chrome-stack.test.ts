import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { JSDOM } from "jsdom";

import {
  CATALOG_BAR_RESERVE_CSS,
  CONSENT_BANNER_RESERVE_PX,
  FLOATING_CHROME_CONSENT_Z,
  FLOATING_CHROME_STACK_CSS,
  floatingBannerUp,
  floatingChromeBottomUsesMax,
  floatingChromeClearsHeroCtas,
  floatingChromeYieldsToGuestChat,
  HELP_BUBBLE_CHIP_CLEARANCE_PX,
  HELP_BUBBLE_FILTER_BAND_RATIO,
  helpBubbleFilterBandProtectsChips,
  helpBubbleFilterNavBlocking,
} from "./floating-chrome-stack";

const root = join(process.cwd(), "src");

describe("TUL-516 / TUL-528 floating chrome stack", () => {
  test("F1/F2: consent hides locale + chat launcher; reserves bottom for legal CTAs", () => {
    assert.match(FLOATING_CHROME_STACK_CSS, /body:has\(\[data-consent-banner\]\) \[data-locale-suggestion\]\{display:none\}/);
    assert.match(FLOATING_CHROME_STACK_CSS, /body:has\(\[data-consent-banner\]\) \[data-guest-chat-launcher\]/);
    assert.match(FLOATING_CHROME_STACK_CSS, /pointer-events:none/);
    assert.match(FLOATING_CHROME_STACK_CSS, new RegExp(`--floating-consent-clearance:calc\\(${CONSENT_BANNER_RESERVE_PX}px`));
    assert.equal(FLOATING_CHROME_CONSENT_Z, 98);
  });

  test("F3/F5: body padding is max(bar, launcher, consent, safe-area), never a lone override", () => {
    assert.equal(floatingChromeBottomUsesMax(FLOATING_CHROME_STACK_CSS), true);
    assert.match(FLOATING_CHROME_STACK_CSS, /body\{padding-bottom:var\(--floating-chrome-bottom\)\}/);
    assert.match(FLOATING_CHROME_STACK_CSS, /--floating-launcher-clearance:calc\(/);
    assert.doesNotMatch(FLOATING_CHROME_STACK_CSS, /body:has\(\[data-guest-chat-launcher\]\)\{padding-bottom:/);
  });

  test("catalog bar CSS sets --cb-bar-h and hide-at-top without fighting body padding", () => {
    assert.match(CATALOG_BAR_RESERVE_CSS, /--cb-bar-h:calc\(/);
    assert.match(CATALOG_BAR_RESERVE_CSS, /\.cb-bar\[data-top="true"\]\{opacity:0/);
    assert.doesNotMatch(CATALOG_BAR_RESERVE_CSS, /body\{padding-bottom/);
  });

  test("GRK-034: desktop restores --cb-bar-h while the bar or dock is painted", () => {
    assert.match(
      CATALOG_BAR_RESERVE_CSS,
      /:root:has\(\.cb-bar\[data-show="true"\]:not\(\[data-top="true"\]\),\.cb-dock\[data-show="true"\]\)\{--cb-bar-h:calc\(/,
    );
    const island = readFileSync(join(root, "components/public-booking/catalog-booking-styles.ts"), "utf8");
    assert.match(island, /\.cb-island\{padding-bottom:var\(--cb-bar-h/);
    assert.doesNotMatch(island, /\.cb-island\{padding-bottom:calc\(72px/);
  });

  test("GRK-033: consent-open heroes pad CTAs above the cookie card", () => {
    assert.equal(floatingChromeClearsHeroCtas(FLOATING_CHROME_STACK_CSS), true);
    assert.match(FLOATING_CHROME_STACK_CSS, /site-bn-hero__inner\{padding-bottom:max\(/);
  });

  test("GRK-039: consent yields to guest chat panel; shells mark data-guest-chat-panel", () => {
    assert.equal(floatingChromeYieldsToGuestChat(FLOATING_CHROME_STACK_CSS), true);
    for (const file of [
      "app/t/[profileCode]/_chat/MiniChatPanel.tsx",
      "app/t/[profileCode]/_chat/CardDockFrame.tsx",
      "app/t/[profileCode]/_chat/ExpandedChatLayout.tsx",
    ]) {
      assert.match(readFileSync(join(root, file), "utf8"), /data-guest-chat-panel/);
    }
  });

  test("floatingBannerUp is true only for painted consent/locale nodes", () => {
    const dom = new JSDOM(`<div data-consent-banner></div>`);
    const el = dom.window.document.querySelector("[data-consent-banner]") as HTMLElement;
    el.getBoundingClientRect = () => ({ width: 320, height: 180 }) as DOMRect;
    assert.equal(floatingBannerUp(dom.window.document), true);
    el.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect;
    assert.equal(floatingBannerUp(dom.window.document), false);
  });

  test("F4 / GRK-038: help teaser blocks when filter chips sit in the lower viewport band", () => {
    assert.equal(helpBubbleFilterBandProtectsChips(HELP_BUBBLE_FILTER_BAND_RATIO, HELP_BUBBLE_CHIP_CLEARANCE_PX), true);
    const dom = new JSDOM(
      `<nav class="site-builder-node--services-catalog-nav"><button class="site-builder-node--services-catalog-pill">Gel</button></nav>`,
    );
    const nav = dom.window.document.querySelector(".site-builder-node--services-catalog-nav") as HTMLElement;
    // Mid-lower row that 0.55 used to miss relative to the teaser (~y 500 on 844).
    nav.getBoundingClientRect = () => ({ width: 300, height: 40, top: 360, bottom: 400, left: 0, right: 300 }) as DOMRect;
    assert.equal(helpBubbleFilterNavBlocking(dom.window.document, 844), true);
    nav.getBoundingClientRect = () => ({ width: 300, height: 40, top: 72, bottom: 112, left: 0, right: 300 }) as DOMRect;
    assert.equal(helpBubbleFilterNavBlocking(dom.window.document, 844), false);
    // Pill alone in the FAB clearance zone.
    const pill = dom.window.document.querySelector(".site-builder-node--services-catalog-pill") as HTMLElement;
    nav.getBoundingClientRect = () => ({ width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 }) as DOMRect;
    pill.getBoundingClientRect = () =>
      ({ width: 80, height: 36, top: 720, bottom: 756, left: 12, right: 92 }) as DOMRect;
    assert.equal(helpBubbleFilterNavBlocking(dom.window.document, 844), true);
  });

  test("root layout mounts the stack styles; consent z-index is above the chat FAB", () => {
    const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
    assert.match(layout, /FloatingChromeStackStyles/);
    const consent = readFileSync(join(root, "components/analytics/analytics-consent-banner.tsx"), "utf8");
    assert.match(consent, /z-\[98\]|zIndex:\s*98|z-index:\s*98/);
  });

  test("sticky bar measure never writes zero over the CSS default", () => {
    const hook = readFileSync(join(root, "lib/site-admin/builder-node/use-sticky-bar-visible.ts"), "utf8");
    assert.match(hook, /if \(reserve > 0\) root\.style\.setProperty\("--cb-bar-h"/);
    assert.match(hook, /else root\.style\.removeProperty\("--cb-bar-h"\)/);
  });
});

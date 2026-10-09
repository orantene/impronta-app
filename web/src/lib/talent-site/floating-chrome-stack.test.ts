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
  helpBubbleFilterNavBlocking,
} from "./floating-chrome-stack";

const root = join(process.cwd(), "src");

describe("TUL-516 floating chrome stack", () => {
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

  test("floatingBannerUp is true only for painted consent/locale nodes", () => {
    const dom = new JSDOM(`<div data-consent-banner></div>`);
    const el = dom.window.document.querySelector("[data-consent-banner]") as HTMLElement;
    el.getBoundingClientRect = () => ({ width: 320, height: 180 }) as DOMRect;
    assert.equal(floatingBannerUp(dom.window.document), true);
    el.getBoundingClientRect = () => ({ width: 0, height: 0 }) as DOMRect;
    assert.equal(floatingBannerUp(dom.window.document), false);
  });

  test("F4: help teaser blocks when filter chips sit in the lower viewport band", () => {
    const dom = new JSDOM(`<nav class="site-builder-node--services-catalog-nav"><button>Gel</button></nav>`);
    const nav = dom.window.document.querySelector(".site-builder-node--services-catalog-nav") as HTMLElement;
    nav.getBoundingClientRect = () => ({ width: 300, height: 40, top: 500, bottom: 540, left: 0, right: 300 }) as DOMRect;
    assert.equal(helpBubbleFilterNavBlocking(dom.window.document, 844), true);
    nav.getBoundingClientRect = () => ({ width: 300, height: 40, top: 72, bottom: 112, left: 0, right: 300 }) as DOMRect;
    assert.equal(helpBubbleFilterNavBlocking(dom.window.document, 844), false);
  });

  test("root layout mounts the stack styles; consent z-index is above the chat FAB", () => {
    const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");
    assert.match(layout, /FloatingChromeStackStyles/);
    const consent = readFileSync(join(root, "components/analytics/analytics-consent-banner.tsx"), "utf8");
    assert.match(consent, /z-\[98\]|zIndex:\s*98|z-index:\s*98/);
  });
});

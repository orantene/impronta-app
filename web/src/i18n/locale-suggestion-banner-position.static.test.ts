import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  FLOATING_CHROME_STACK_CSS,
  FLOATING_CHROME_LOCALE_Z,
  SITE_DEMO_BADGE_SELECTOR,
} from "@/lib/talent-site/floating-chrome-stack";

const root = join(__dirname, "..");
const client = readFileSync(join(root, "components/locale-suggestion-banner-client.tsx"), "utf8");
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");

test("TUL-516 P1: language toast is a floating overlay (stack CSS), not an in-flow top row", () => {
  assert.match(FLOATING_CHROME_STACK_CSS, /\[data-locale-suggestion\]\{position:fixed/);
  assert.match(FLOATING_CHROME_STACK_CSS, new RegExp(`z-index:${FLOATING_CHROME_LOCALE_Z}`));
  assert.match(FLOATING_CHROME_STACK_CSS, /bottom:calc\(var\(--floating-chrome-bottom\)/);
  assert.match(FLOATING_CHROME_STACK_CSS, /@media \(min-width:640px\)\{\[data-locale-suggestion\]\{left:auto;right:/);
  // Outer shell is print:hidden only (no in-flow shrink-0 row). Inner button
  // group may still use shrink-0 for flex wrapping inside the toast card.
  assert.match(client, /className="print:hidden"/);
  assert.doesNotMatch(client, /className="[^"]*shrink-0[^"]*print:hidden/);
  assert.match(client, /from "next\/link"/);
  assert.match(client, /<Link\b/);
});

test("TUL-516 P1: banner still mounts in the root layout (shared by every public shell)", () => {
  const banner = layout.indexOf("<LocaleSuggestionBanner ");
  const children = layout.indexOf("{children}");
  assert.ok(banner > 0 && children > 0);
});

test("TUL-516: floating chrome stack styles mount before the language banner", () => {
  const stack = layout.indexOf("<FloatingChromeStackStyles");
  const banner = layout.indexOf("<LocaleSuggestionBanner ");
  assert.ok(stack > 0 && banner > 0);
  assert.ok(stack < banner, "stack CSS precedes locale suggestion in <body>");
});

test("TUL-516 P1: consent hides the language toast so cookie CTAs stay free", () => {
  assert.match(
    FLOATING_CHROME_STACK_CSS,
    /body:has\(\[data-consent-banner\]\) \[data-locale-suggestion\]\{display:none\}/,
  );
  assert.match(
    FLOATING_CHROME_STACK_CSS,
    new RegExp(
      `body:has\\(\\[data-locale-suggestion\\]\\) ${SITE_DEMO_BADGE_SELECTOR.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{display:none\\}`,
    ),
  );
});

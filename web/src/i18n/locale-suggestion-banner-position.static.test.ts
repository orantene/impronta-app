import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { shouldSuggestLocale } from "@/i18n/locale-suggestion";
import { CHROME_MAC } from "@/i18n/locale-suggestion-fixtures";
import { localeUrlSettings } from "@/i18n/pathnames";
import { CATALOG_BOOKING_CSS } from "@/components/public-booking/catalog-booking-styles";
import { FLOATING_CHROME_STACK_CSS } from "@/lib/talent-site/floating-chrome-stack";
import { CONSENT_BANNER_TOP_VAR } from "@/lib/talent-site/consent-banner-top";

const root = join(__dirname, "..");
const client = readFileSync(join(root, "components/locale-suggestion-banner-client.tsx"), "utf8");
const server = readFileSync(join(root, "components/locale-suggestion-banner.tsx"), "utf8");
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");

test("TUL-560: the language suggestion is a fixed bottom-left toast, never a row above the header", () => {
  const cls = client.match(/className="([^"]*print:hidden[^"]*)"/)?.[1] ?? "";
  assert.ok(cls, "outer toast className found");
  assert.match(cls, /\bfixed\b/, "overlays the page, takes no layout space");
  assert.match(cls, /\bleft-3\b/);
  assert.match(cls, /max-w-\[340px\]/);
  assert.doesNotMatch(cls, /\b(relative|static|sticky)\b/, "an in-flow row pushes the header down");
  assert.doesNotMatch(cls, /\b(top|inset|inset-y)-/, "anchored to the top is above the header");
  assert.doesNotMatch(cls, /\bshrink-0\b/, "no in-flow body row");
  assert.match(FLOATING_CHROME_STACK_CSS, /\[data-locale-suggestion\]\{bottom:calc\(var\(--floating-chrome-bottom\) \+ 12px\)\}/);
  assert.doesNotMatch(FLOATING_CHROME_STACK_CSS, /\[data-locale-suggestion\]\{[^}]*\btop:/);
});

test("TUL-560: on short desktop windows the toast is a one-row pill that keeps the question for screen readers", () => {
  const short = FLOATING_CHROME_STACK_CSS.match(/@media \(min-width:701px\) and \(max-height:859px\)\{(.*?\})\}/)?.[1] ?? "";
  assert.ok(short, "short-window rule present (under 860px tall)");
  assert.match(short, /\[data-locale-suggestion-card\]\{flex-wrap:nowrap;/);
  assert.match(short, /border-radius:var\(--token-button-radius,999px\)/);
  assert.match(short, /\[data-locale-suggestion-prompt\]\{position:absolute;width:1px;height:1px;overflow:hidden;clip:/);
  assert.doesNotMatch(short, /display:none/, "the question is visually hidden, not removed");
  assert.match(client, /data-locale-suggestion-card=""/);
  assert.match(client, /<p data-locale-suggestion-prompt=""/);
});

test("TUL-560: the toast is not in the first paint; it appears after the page settles", () => {
  const ms = Number(client.match(/LOCALE_SUGGESTION_SETTLE_MS = (\d+)/)?.[1]);
  assert.ok(ms >= 1000 && ms <= 3000, `settle delay ${ms}ms`);
  assert.match(client, /if \(hidden \|\| !settled\) return null;/);
  assert.match(client, /document\.readyState === "complete"/);
  assert.match(client, /addEventListener\("load", arm/);
  assert.match(FLOATING_CHROME_STACK_CSS, /prefers-reduced-motion:reduce\)\{\[data-locale-suggestion\]>div\{animation:none\}/);
});

test("TUL-560: the toast takes the site's theme tokens, not a fixed black bar", () => {
  assert.match(client, /bg-\[var\(--token-color-surface-raised,/);
  assert.match(client, /text-\[var\(--token-color-ink,/);
  assert.match(client, /rounded-\[var\(--token-shape-radius-card,min\(var\(--site-radius-lg,/, "sharp themes get square corners");
  assert.match(client, /bg-\[var\(--token-color-primary,/, "same color as .site-btn--primary");
  assert.doesNotMatch(client, /bg-(black|neutral-9\d\d|zinc-9\d\d)\b/);
});

test("TUL-560: the toast waits for the cookie card, and yields to modals, chat and booking chrome", () => {
  assert.match(FLOATING_CHROME_STACK_CSS, /body:has\(\[data-consent-banner\]\) \[data-locale-suggestion\]/);
  assert.match(FLOATING_CHROME_STACK_CSS, /body:has\(\[role="dialog"\]\[aria-modal="true"\]\) \[data-locale-suggestion\]/);
  assert.match(FLOATING_CHROME_STACK_CSS, /body:has\(\[data-guest-chat-panel\]\) \[data-locale-suggestion\]/);
  assert.match(CATALOG_BOOKING_CSS, /body:has\(\.cb-dock\[data-show="true"\]\) \[data-locale-suggestion\]/);
});

test("TUL-560: the chat launcher does not jump when the toast appears", () => {
  const launcherLift = readFileSync(join(root, "app/t/[profileCode]/_chat/use-yield-booking-bar.ts"), "utf8");
  assert.doesNotMatch(launcherLift, /querySelector[^;]*data-locale-suggestion/);
});

test("TUL-560: the demo badge sits bottom-right, clears the phone chat launcher, and gives way to the toast", () => {
  assert.match(FLOATING_CHROME_STACK_CSS, /\[data-demo-badge\]\{position:fixed;right:max\(16px,[^}]*bottom:calc\(var\(--floating-chrome-bottom\) \+ 12px\)/);
  assert.doesNotMatch(FLOATING_CHROME_STACK_CSS, /\[data-demo-badge\]\{[^}]*\b(top|left):/);
  assert.match(FLOATING_CHROME_STACK_CSS, /@media \(max-width:700px\)\{body:has\(\[data-guest-chat-launcher\]\) \[data-demo-badge\]\{bottom:calc\(max\(/);
  assert.match(FLOATING_CHROME_STACK_CSS, /body:has\(\[data-locale-suggestion\]\):not\(:has\(\[data-consent-banner\]\)\) \[data-demo-badge\]\{display:none\}/);
  assert.match(FLOATING_CHROME_STACK_CSS, /body:has\(\.cb-dock\[data-show="true"\]\) \[data-demo-badge\]/);
  assert.match(FLOATING_CHROME_STACK_CSS, /body:has\(\.cb-bar\[data-show="true"\]:not\(\[data-top="true"\]\)\) \[data-demo-badge\]/);
});

test("TUL-528 PM-LIVE7: the demo badge stays visible above the consent card instead of hiding under it", () => {
  assert.doesNotMatch(FLOATING_CHROME_STACK_CSS, /body:has\(\[data-consent-banner\]\) \[data-demo-badge\]\{display:none\}/);
  const lift = /html body:has\(\[data-consent-banner\]\) \[data-demo-badge\]\{bottom:calc\(var\(--consent-banner-top,\d+px\) \+ 10px\)\}/;
  assert.match(FLOATING_CHROME_STACK_CSS, lift);
  const phoneLauncher = FLOATING_CHROME_STACK_CSS.indexOf("body:has([data-guest-chat-launcher]) [data-demo-badge]{bottom:");
  assert.ok(phoneLauncher >= 0 && FLOATING_CHROME_STACK_CSS.search(lift) > phoneLauncher, "the lift wins over the phone launcher clearance");
  const banner = readFileSync(join(root, "components/analytics/analytics-consent-banner.tsx"), "utf8");
  assert.equal((banner.match(/ref=\{bannerRef\}/g) ?? []).length, 2, "both the card and the notice publish their top");
  assert.match(banner, /trackConsentBannerTop\(el\)/);
  assert.ok(FLOATING_CHROME_STACK_CSS.includes(`var(${CONSENT_BANNER_TOP_VAR},`), "CSS reads the variable the card publishes");
});

test("TUL-560: a single-language site never gets the toast, whatever the browser says", () => {
  for (const solo of [localeUrlSettings("es", ["es"]), localeUrlSettings("en", ["en"])]) {
    const decision = shouldSuggestLocale({
      acceptLanguage: "en-US,en;q=0.9,es;q=0.8,fr;q=0.5",
      country: "US",
      currentLocale: solo.defaultLocale,
      renderLocale: solo.defaultLocale,
      tenantSettings: solo,
      showLanguageSwitcher: true,
      pathname: "/",
      userAgent: CHROME_MAC,
      cookieLocale: "en",
      localeCookieIsAuto: true,
    });
    assert.deepEqual(decision, { suggest: false, reason: "single-locale-tenant" });
  }
  assert.match(server, /if \(!decision\.suggest\) return null;/, "the server component renders nothing on a no");
});

test("TUL-560: the client toast imports only leaf modules, so No thanks hydrates", () => {
  assert.doesNotMatch(client, /from "@\/i18n\/locale-suggestion"/);
  assert.doesNotMatch(client, /locale-middleware|next\/server/);
  assert.match(client, /LOCALE_SUGGESTION_DISMISSED_COOKIE,\n\} from "@\/i18n\/locale-cookies"/);
});

test("TUL-516: floating chrome stack styles mount before the language banner", () => {
  const stack = layout.indexOf("<FloatingChromeStackStyles");
  const banner = layout.indexOf("<LocaleSuggestionBanner ");
  assert.ok(stack > 0 && banner > 0);
  assert.ok(stack < banner, "stack CSS precedes locale suggestion in <body>");
});

test("live2b-05: client banner never imports locale-suggestion / locale-middleware", () => {
  assert.doesNotMatch(client, /from ["']@\/i18n\/locale-suggestion["']/);
  assert.doesNotMatch(client, /from ["']@\/i18n\/locale-middleware["']/);
  assert.doesNotMatch(client, /from ["']next\/server["']/);
  assert.match(client, /LOCALE_SUGGESTION_DISMISSED_COOKIE/);
  assert.match(client, /from ["']@\/i18n\/locale-cookies["']/);
  assert.match(client, /tulala_locale_suggest_dismissed/);
});

test("TUL-884: the page reserves room under the toast so footer links are never covered", () => {
  assert.match(
    FLOATING_CHROME_STACK_CSS,
    /body:has\(\[data-locale-suggestion\]\)\{padding-bottom:calc\(var\(--floating-chrome-bottom\) \+ 88px\)\}/,
  );
  assert.match(client, /"No thanks"|dismissLabel/, "the toast stays dismissible");
});

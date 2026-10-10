import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(__dirname, "..");
const client = readFileSync(join(root, "components/locale-suggestion-banner-client.tsx"), "utf8");
const layout = readFileSync(join(root, "app/layout.tsx"), "utf8");

test("TUL-394: the language banner is an in-flow row, never a fixed overlay over a bottom CTA", () => {
  const cls = client.match(/className="([^"]*print:hidden[^"]*)"/)?.[1] ?? "";
  assert.ok(cls, "outer banner className found");
  assert.doesNotMatch(cls, /\b(fixed|sticky|absolute)\b/);
  assert.doesNotMatch(cls, /\bbottom-/);
  assert.doesNotMatch(cls, /\bz-\d+/);
  assert.match(cls, /\bshrink-0\b/);
});

test("TUL-394: the banner mounts before the page content, not after it", () => {
  const banner = layout.indexOf("<LocaleSuggestionBanner ");
  const children = layout.indexOf("{children}");
  assert.ok(banner > 0 && children > 0);
  assert.ok(banner < children, "banner row precedes {children} in <body>");
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
  assert.match(client, /CONSENT_BANNER_CLOSED_EVENT/);
  assert.match(client, /tulala_locale_suggest_dismissed/);
});

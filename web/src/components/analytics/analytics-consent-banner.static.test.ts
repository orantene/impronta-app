import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "analytics-consent-banner.tsx"), "utf8");

test("consent banner keeps the marketing surface scope on the platform so body site-theme-dark cannot paint it black", () => {
  assert.match(src, /data-platform-surface=\{themed \? undefined : "marketing"\}/);
  assert.match(src, /themed \? "" : "site-theme-platform "/);
  assert.match(src, /--consent-surface:var\(--tl-surface-raised/);
  assert.match(src, /--consent-primary:var\(--tl-forest/);
  assert.doesNotMatch(src, /bg-background/);
  assert.doesNotMatch(src, /bg-foreground/);
});

test("TUL-561: no square backing — the wrapper is transparent, only the rounded card paints", () => {
  assert.match(src, /\[data-consent-banner\]\{background:transparent;/);
  assert.match(src, /\[data-consent-card\]\{background:var\(--consent-surface\);[^}]*border-radius:var\(--consent-radius\)/);
  assert.doesNotMatch(src, /style=\{\{\s*background: "var\(--tl-/, "card colors come from --consent-*, not inline --tl");
});

test("TUL-561: agency and talent sites paint the card from their theme tokens", () => {
  const themed = src.match(/\[data-consent-banner\]\[data-consent-themed\]\{([^}]*)\}/)?.[1] ?? "";
  for (const token of [
    "--token-color-surface-raised",
    "--token-color-ink",
    "--token-color-line",
    "--token-color-primary",
    "--token-color-primary-on",
    "--token-shape-radius-card",
    "--token-button-radius",
    "--site-body-font",
  ]) {
    assert.ok(themed.includes(token), `themed card reads ${token}`);
  }
  assert.doesNotMatch(themed, /--tl-/, "a themed site never falls back to the Tulala palette");
  assert.match(src, /\[data-consent-themed\] \[data-consent-title\]\{font-family:var\(--site-heading-font/);
  const layout = readFileSync(join(here, "../../app/layout.tsx"), "utf8");
  assert.match(layout, /themed=\{Boolean\(publicScope\) \|\| reqHeaders\.get\(HOST_CONTEXT_HEADER\) === "talent_site"\}/);
});

test("TUL-561: a slim full-width bottom sheet on phones, a corner card from sm up", () => {
  assert.match(src, /fixed inset-x-0 bottom-0 z-\[98\]/);
  assert.match(src, /md:right-5 md:translate-x-0 md:w-\[22\.5rem\]/);
  assert.match(src, /@media \(max-width:639px\)\{\[data-consent-card\]\{border-bottom:0;border-bottom-left-radius:0;border-bottom-right-radius:0;padding-bottom:calc\(0\.875rem \+ env\(safe-area-inset-bottom/);
});

test("consent banner keeps accept / decline / dismiss + policy links", () => {
  assert.match(src, /choose\("granted"\)/);
  assert.match(src, /choose\("denied"\)/);
  assert.match(src, /public\.consent\.accept/);
  assert.match(src, /public\.consent\.decline/);
  assert.match(src, /public\.consent\.closeLabel/);
  assert.match(src, /legal\/privacy/);
  assert.match(src, /legal\/cookies/);
  assert.match(src, /data-consent-banner/);
});

test("consent banner does not enable unfinished talent consent tooling", () => {
  assert.doesNotMatch(src, /TALENT_SITE_CONSENT_TOOLING_ENABLED/);
});

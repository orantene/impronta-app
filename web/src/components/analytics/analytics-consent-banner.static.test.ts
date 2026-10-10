import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "analytics-consent-banner.tsx"), "utf8");

test("consent banner keeps the marketing surface scope so body site-theme-dark cannot paint it black", () => {
  assert.match(src, /data-platform-surface="marketing"/);
  assert.match(src, /site-theme-platform/);
  assert.match(src, /--tl-surface-raised/);
  assert.match(src, /--tl-forest/);
  assert.doesNotMatch(src, /bg-background/);
  assert.doesNotMatch(src, /bg-foreground/);
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

test("consent banner reserves marketing phone clearance so pricing clears the card (GRK-040)", () => {
  assert.match(src, /CONSENT_BANNER_RESERVE_PX/);
  assert.match(
    src,
    /body:has\(\[data-consent-banner\]\) \[data-platform-surface="marketing"\]/,
  );
  assert.match(src, /padding-bottom: calc\(\$\{CONSENT_BANNER_RESERVE_PX\}px/);
  assert.match(
    src,
    /html:has\(\[data-consent-banner\]\):has\(\[data-platform-surface="marketing"\]\)/,
  );
  assert.match(src, /scroll-padding-bottom: calc\(\$\{CONSENT_BANNER_RESERVE_PX\}px/);
  assert.match(src, /@media \(max-width: 640px\)/);
});

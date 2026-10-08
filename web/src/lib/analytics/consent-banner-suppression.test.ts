import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  isConsentBannerSuppressedPath,
  resolveConsent,
  shouldShowBanner,
} from "./consent";
import { WEB_ROOT } from "../quality/supabase-unchecked-read";

test("the onboarding flow and sandboxes opt out of the consent banner", () => {
  for (const p of ["/start", "/start/", "/start/x", "/prototypes/a", "/template-preview/b"]) {
    assert.equal(isConsentBannerSuppressedPath(p), true, p);
  }
});

test("other routes still show it, including look-alike prefixes", () => {
  for (const p of ["/", "/startup", "/started", "/get-started", "/login", null, undefined]) {
    assert.equal(isConsentBannerSuppressedPath(p), false, String(p));
  }
});

test("suppressing the banner is not consent: with no stored choice analytics stay denied", () => {
  assert.equal(resolveConsent(null, false), null);
  assert.equal(shouldShowBanner(null, false), true);
});

test("the banner component reads the shared suppression rule", () => {
  const src = readFileSync(join(WEB_ROOT, "src/components/analytics/analytics-consent-banner.tsx"), "utf8");
  assert.match(src, /isConsentBannerSuppressedPath\(pathname\)/);
});

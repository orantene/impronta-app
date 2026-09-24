import assert from "node:assert/strict";
import test from "node:test";

import { talentSiteShouldUsePreferredLocale } from "./talent-site-preferred-locale";

test("talent vanity hosts without a locale prefix use preferred_locale", () => {
  assert.equal(
    talentSiteShouldUsePreferredLocale({
      hostContext: "talent_site",
      hasLocalePrefix: false,
    }),
    true,
  );
});

test("a prefixed URL keeps the URL locale on a talent host", () => {
  assert.equal(
    talentSiteShouldUsePreferredLocale({
      hostContext: "talent_site",
      hasLocalePrefix: true,
    }),
    false,
  );
});

test("hub and agency hosts do not take the talent preferred_locale branch", () => {
  assert.equal(
    talentSiteShouldUsePreferredLocale({
      hostContext: "hub",
      hasLocalePrefix: false,
    }),
    false,
  );
  assert.equal(
    talentSiteShouldUsePreferredLocale({
      hostContext: "agency",
      hasLocalePrefix: false,
    }),
    false,
  );
});

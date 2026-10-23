/**
 * TUL-1057: the onboarding/signup front-door footer built its Terms and
 * Privacy links unprefixed (`${resolveMarketingOrigin()}/legal/terms`), so a
 * visitor on a Spanish onboarding session (`/es/onboarding/...`, `/es/start`)
 * who clicked either link dropped the `/es` prefix and landed on the
 * English-default legal pages. Both links must carry the page's own
 * `locale` through `withLocaleHref`, the same helper the marketing footer
 * (`components/marketing/footer.tsx`) already uses for its legal column.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { withLocaleHref } from "@/i18n/pathnames";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "onboarding-footer.tsx"), "utf8");

test("legal links are locale-aware, not built from a bare unprefixed path", () => {
  assert.match(src, /import \{ withLocaleHref \} from "@\/i18n\/pathnames";/);
  assert.match(
    src,
    /href=\{`\$\{resolveMarketingOrigin\(\)\}\$\{withLocaleHref\("\/legal\/terms", locale\)\}`\}/,
  );
  assert.match(
    src,
    /href=\{`\$\{resolveMarketingOrigin\(\)\}\$\{withLocaleHref\("\/legal\/privacy", locale\)\}`\}/,
  );
  assert.doesNotMatch(src, /\$\{resolveMarketingOrigin\(\)\}\/legal\/terms`/);
  assert.doesNotMatch(src, /\$\{resolveMarketingOrigin\(\)\}\/legal\/privacy`/);
});

test("withLocaleHref actually produces the /es-prefixed legal URLs the footer now links to", () => {
  assert.equal(withLocaleHref("/legal/terms", "es"), "/es/legal/terms");
  assert.equal(withLocaleHref("/legal/privacy", "es"), "/es/legal/privacy");
  assert.equal(withLocaleHref("/legal/terms", "en"), "/legal/terms");
  assert.equal(withLocaleHref("/legal/privacy", "en"), "/legal/privacy");
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { withLocaleHref } from "@/i18n/pathnames";

// Bucket TUL-518 (S2): /es/start 'Vengo a reservar con alguien' opened the
// English /directory. The link follows the flow language.
test("the 'I'm here to book' link keeps the flow language", () => {
  assert.equal(withLocaleHref("/directory", "es"), "/es/directory");
  assert.equal(withLocaleHref("/directory", "en"), "/directory");
  const src = readFileSync(join(process.cwd(), "src/components/onboarding/steps/choose-step.tsx"), "utf8");
  assert.match(src, /href=\{withLocaleHref\("\/directory", locale\)\}/);
  assert.doesNotMatch(src, /href="\/directory"/);
});

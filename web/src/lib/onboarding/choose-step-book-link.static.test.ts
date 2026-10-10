import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { withLocaleHref } from "@/i18n/pathnames";
import { CHOOSE_COPY } from "@/lib/onboarding/flow";

// Bucket TUL-518 (S2 / W5-13): /es/start 'Vengo a reservar con alguien' opened the
// English /directory. The link follows the flow language, hard-navigates so the
// prefix cannot drop on soft-nav, and shows a loader for the ~3s hop.
test("the 'I'm here to book' link keeps the flow language", () => {
  assert.equal(withLocaleHref("/directory", "es"), "/es/directory");
  assert.equal(withLocaleHref("/directory", "en"), "/directory");
  const src = readFileSync(join(process.cwd(), "src/components/onboarding/steps/choose-step.tsx"), "utf8");
  assert.match(src, /withLocaleHref\("\/directory", locale\)/);
  assert.doesNotMatch(src, /href="\/directory"/);
  assert.match(src, /window\.location\.assign\(directoryHref\)/);
  assert.match(src, /data-testid="onb-book-leaving"/);
  assert.match(src, /bookOpening/);
});

test("book-someone opening copy is present in en and es with no em dash", () => {
  for (const locale of ["en", "es"] as const) {
    assert.ok(CHOOSE_COPY[locale].bookOpening.length > 0, locale);
    assert.ok(!/—/.test(CHOOSE_COPY[locale].bookOpening), `${locale}: no em dash`);
  }
  assert.match(CHOOSE_COPY.en.bookOpening, /directory/i);
  assert.match(CHOOSE_COPY.es.bookOpening, /directorio/i);
});

test("global-directory exposes a loading skeleton", () => {
  const src = readFileSync(
    join(process.cwd(), "src/app/(marketing)/global-directory/loading.tsx"),
    "utf8",
  );
  assert.match(src, /data-testid="global-directory-loading"/);
  assert.match(src, /aria-busy/);
});

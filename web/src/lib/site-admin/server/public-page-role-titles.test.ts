/** TUL-697: /w/<slug>/services|about|gallery|contact (+ ES aliases) get a real page title, never "Not found". */
import assert from "node:assert/strict";
import test from "node:test";

import { pickMetaRow, ROLE_SLUG_PAIRS } from "./public-page-fallback";
import { assemblePageMetadata } from "./public-page-canonical";

const ROLES = ROLE_SLUG_PAIRS.filter(([en]) => ["services", "about", "gallery", "contact"].includes(en));

function metaFor(row: { title: string }) {
  return assemblePageMetadata(
    { title: row.title, meta_title: null, meta_description: null, og_title: null, og_description: null, og_image_url: null, noindex: false, canonical_url: null },
    {},
    null,
  );
}

test("all four public roles are covered by the alias table", () => {
  assert.deepEqual(ROLES.map(([en]) => en).sort(), ["about", "contact", "gallery", "services"]);
});

for (const [en, es] of ROLES) {
  test(`TUL-697: ${en}/${es} resolve to a real title for EN and ES requests, both slug spellings`, () => {
    // Site authored with the Spanish slug in "en" locale, and a site with the English slug in "es".
    const esSlugSite = [{ locale: "en", slug: es, title: `Real ${en}` }];
    const enSlugSite = [{ locale: "es", slug: en, title: `Titulo ${es}` }];
    for (const [rows, requested, locale] of [
      [esSlugSite, en, "en"], [esSlugSite, es, "en"], [esSlugSite, en, "es"],
      [enSlugSite, en, "es"], [enSlugSite, es, "es"], [enSlugSite, es, "en"],
    ] as const) {
      const hit = pickMetaRow(rows, locale, requested, ["es", "en"]);
      assert.ok(hit, `${locale}/${requested} must resolve`);
      const title = String(metaFor(hit.row).title);
      assert.notEqual(title, "Not found");
      assert.match(title, /^(Real|Titulo) /);
    }
  });
}

import assert from "node:assert/strict";
import { test } from "node:test";

import { TALENT_EDITION_HELP } from "@/components/admin/shell/internal/help-registry-talent-edition";
import { HELP_ARTICLES, getHelpArticle, listHelpArticles } from "./help-articles";
import { TALENT_EDITION_HELP_ES } from "./help-corpus-es-edition";
import { helpCorpusForLocale, retrieveHelpEntriesForLocale } from "./help-corpus-locale";

test("TUL-1392: every article resolves to non-empty sections in en and es", () => {
  for (const def of HELP_ARTICLES) {
    for (const loc of ["en", "es"]) {
      const a = getHelpArticle(def.slug, loc);
      assert.ok(a, `${def.slug}/${loc}`);
      assert.equal(a.sections.length, def.keys.length, `${def.slug}/${loc} sections`);
      assert.ok(a.title.length > 0 && a.summary.length > 0);
    }
  }
  assert.equal(getHelpArticle("nope", "en"), null);
  assert.equal(listHelpArticles("es").length, HELP_ARTICLES.length);
});

test("TUL-1392: Spanish edition entries mirror the English ones slug for slug", () => {
  assert.deepEqual(Object.keys(TALENT_EDITION_HELP_ES).sort(), Object.keys(TALENT_EDITION_HELP).sort());
  for (const k of Object.keys(TALENT_EDITION_HELP)) {
    assert.equal(TALENT_EDITION_HELP_ES[k].faqs?.length, TALENT_EDITION_HELP[k].faqs?.length, k);
    assert.equal(TALENT_EDITION_HELP_ES[k].ticketCategory, TALENT_EDITION_HELP[k].ticketCategory, k);
  }
});

test("TUL-1392: no em dashes in the new copy", () => {
  const all = JSON.stringify([TALENT_EDITION_HELP, TALENT_EDITION_HELP_ES, HELP_ARTICLES]);
  assert.ok(!all.includes("—"));
});

test("TUL-1392: the support AI corpus answers how-to questions from the new articles", () => {
  assert.ok(helpCorpusForLocale("en").some((e) => e.slug === "talent-promos"));
  assert.ok(helpCorpusForLocale("es").some((e) => e.slug === "talent-get-found"));
  const en = retrieveHelpEntriesForLocale("how do I create a promo", "en");
  assert.equal(en[0]?.slug, "talent-promos");
  const es = retrieveHelpEntriesForLocale("como publico un post", "es");
  assert.ok(es.some((e) => e.slug === "talent-posts"));
});

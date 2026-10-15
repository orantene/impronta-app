import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { TALENT_HELP } from "@/components/admin/shell/internal/help-registry-talent";
import { TALENT_HELP_ES } from "./help-corpus-es";
import { helpCorpusForLocale, isSpanishLocale, retrieveHelpEntriesForLocale } from "./help-corpus-locale";

describe("Spanish help corpus", () => {
  test("every English talent entry has a Spanish twin with matching shape", () => {
    for (const [slug, en] of Object.entries(TALENT_HELP)) {
      const es = TALENT_HELP_ES[slug];
      assert.ok(es, `missing Spanish twin for ${slug}`);
      assert.equal(es.faqs?.length, en.faqs?.length, `${slug} faq count`);
      assert.equal(es.youCanHere.length, en.youCanHere.length, `${slug} youCanHere count`);
      assert.equal(es.ticketCategory, en.ticketCategory, `${slug} ticketCategory`);
    }
    assert.deepEqual(Object.keys(TALENT_HELP_ES).sort(), Object.keys(TALENT_HELP).sort());
  });

  test("no em or en dashes in the Spanish copy", () => {
    assert.ok(!/[–—]/.test(JSON.stringify(TALENT_HELP_ES)));
  });

  test("Spanish entries carry no English label glosses", () => {
    assert.ok(!/\((?:Services|Messages|Calendar|Availability|Defaults|Change design)\)/.test(JSON.stringify(TALENT_HELP_ES)));
  });

  test("a Spanish question about hours grounds on the Spanish hours entry", () => {
    const hit = retrieveHelpEntriesForLocale("¿Cómo cambio mi horario?", "es-MX", { limit: 3 })[0];
    assert.equal(hit?.slug, "talent-hours");
    assert.match(hit.faqs[0].q, /^¿Cómo cambio mi horario/);
  });

  test("TUL-1014: a Spanish plan-change question grounds on the Spanish plan entry", () => {
    for (const q of ["¿Cómo cambio mi plan?", "quiero cancelar mi plan", "cómo mejoro mi suscripción"]) {
      const hit = retrieveHelpEntriesForLocale(q, "es-MX", { limit: 3 })[0];
      assert.equal(hit?.slug, "talent-plan", q);
      assert.match(hit.faqs[0].q, /^¿Cómo cambio mi plan\?/);
    }
  });

  test("TUL-1014: an English plan-change question grounds on the English plan entry", () => {
    for (const q of ["How do I change my plan?", "how to upgrade my plan", "cancel my subscription"]) {
      const hit = retrieveHelpEntriesForLocale(q, "en", { limit: 3 })[0];
      assert.equal(hit?.slug, "talent-plan", q);
      assert.match(hit.faqs[0].q, /^How do I change my plan\?/);
    }
  });

  test("English locale keeps the English corpus", () => {
    const hit = retrieveHelpEntriesForLocale("how do I change my hours", "en", { limit: 3 })[0];
    assert.equal(hit?.slug, "talent-hours");
    assert.match(hit.faqs[0].q, /^How do I change/);
  });

  test("locale detection and corpus selection", () => {
    assert.ok(isSpanishLocale("es") && isSpanishLocale("es_419") && !isSpanishLocale("fr") && !isSpanishLocale(null));
    assert.notEqual(helpCorpusForLocale("es"), helpCorpusForLocale("en"));
  });
});

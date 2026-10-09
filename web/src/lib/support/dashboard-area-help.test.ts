import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DASHBOARD_AREA_HELP,
  DASHBOARD_AREA_HELP_ENTRIES,
} from "@/components/admin/shell/internal/help-registry-dashboard";
import { retrieveHelpEntries, tokenize } from "./help-corpus";

// A Spanish "how do I change my hours" got a generic profile-settings answer
// because the corpus never named Ajustes > Horarios in Spanish. The hours
// area is the first dashboard-area entry; each area is one bilingual source.

test("settings-hours is in the merged registry under its slug", () => {
  assert.ok(DASHBOARD_AREA_HELP_ENTRIES["settings-hours"]);
  assert.equal(DASHBOARD_AREA_HELP[0]?.slug, "settings-hours");
});

test("one source carries both Settings > Hours and Ajustes > Horarios", () => {
  const area = DASHBOARD_AREA_HELP.find((a) => a.slug === "settings-hours");
  assert.ok(area);
  assert.equal(area.area.en, "Settings > Hours");
  assert.equal(area.area.es, "Ajustes > Horarios");
  assert.match(area.en.purpose, /Settings > Hours/);
  assert.match(area.es.purpose, /Ajustes > Horarios/);
  assert.ok(area.en.faqs.some((f) => /change my hours/i.test(f.q)));
  assert.ok(area.es.faqs.some((f) => /cambio mis horas/i.test(f.q)));
});

test("Spanish how-do-I-change-my-hours retrieves settings-hours", () => {
  const asks = [
    "cómo cambio mis horas",
    "como cambio mis horas",
    "cómo cambio mis horarios",
    "donde cambio mi horario",
  ];
  for (const ask of asks) {
    const slugs = retrieveHelpEntries(ask, { limit: 6 }).map((e) => e.slug);
    assert.ok(
      slugs.includes("settings-hours"),
      `asking "${ask}" retrieved ${slugs.join(", ") || "nothing"} — not settings-hours`,
    );
  }
});

test("English how-do-I-change-my-hours retrieves settings-hours", () => {
  const slugs = retrieveHelpEntries("how do I change my hours", { limit: 6 }).map(
    (e) => e.slug,
  );
  assert.ok(
    slugs.includes("settings-hours"),
    `retrieved ${slugs.join(", ") || "nothing"} — not settings-hours`,
  );
});

test("grounding for the Spanish ask names Ajustes > Horarios", () => {
  const entry = retrieveHelpEntries("cómo cambio mis horas", { limit: 6 }).find(
    (e) => e.slug === "settings-hours",
  );
  assert.ok(entry, "settings-hours missing from retrieval");
  const text = JSON.stringify(entry);
  assert.match(text, /Ajustes > Horarios/);
  assert.match(text, /Settings > Hours/);
});

test("tokenize folds accents so cómo matches como in the corpus", () => {
  assert.deepEqual(tokenize("cómo cambio mis horas"), ["cambio", "horas"]);
});

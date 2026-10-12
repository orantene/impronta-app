import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildTalentTypeLabels,
  localizeCategoryFacets,
  localizeRowTypeLabels,
  needsTalentTypeLabels,
  NO_TALENT_TYPE_LABELS,
} from "./talent-type-labels";
import {
  DIRECTORY_COPY_EN,
  DIRECTORY_COPY_ES,
  directoryCopy,
} from "../../components/marketing/directory/directory-copy";
import { availabilityLine, trustTierMeta } from "../../components/marketing/directory/shared";

const here = dirname(fileURLToPath(import.meta.url));
const dirSrc = (f: string) =>
  readFileSync(join(here, "../../components/marketing/directory", f), "utf8");

/** Production's talent_type rows, trimmed: slug + name_i18n as stored. */
const ROWS = [
  { slug: "fashion-model", name_i18n: { en: "Fashion Model", es: "Modelo de moda" } },
  { slug: "photographer", name_i18n: { en: "Photographer", es: "Fotógrafo" } },
  { slug: "dj", name_i18n: { en: "DJ", es: null } },
];

test("English needs no taxonomy lookup; Spanish does", () => {
  assert.equal(needsTalentTypeLabels("en"), false);
  assert.equal(needsTalentTypeLabels("es"), true);
});

test("/es relabels type facets by slug and card types by their English name", () => {
  const labels = buildTalentTypeLabels(ROWS, "es");
  const facets = localizeCategoryFacets(
    [
      { value: "fashion-model", label: "Fashion Model", count: 9 },
      { value: "dj", label: "DJ", count: 2 },
    ],
    labels,
  );
  assert.deepEqual(
    facets.map((f) => f.label),
    ["Modelo de moda", "DJ"],
    "a type with no Spanish name keeps its English one",
  );
  const rows = localizeRowTypeLabels(
    [{ primaryTypeLabel: "Photographer" }, { primaryTypeLabel: null }, { primaryTypeLabel: "Unknown" }],
    labels,
  );
  assert.deepEqual(rows.map((r) => r.primaryTypeLabel), ["Fotógrafo", null, "Unknown"]);
});

test("English rows pass through untouched", () => {
  const rows = [{ primaryTypeLabel: "Fashion Model" }];
  assert.equal(localizeRowTypeLabels(rows, NO_TALENT_TYPE_LABELS)[0], rows[0]);
});

test("the Spanish directory copy covers every English string", () => {
  assert.deepEqual(Object.keys(DIRECTORY_COPY_ES).sort(), Object.keys(DIRECTORY_COPY_EN).sort());
  assert.equal(directoryCopy("es"), DIRECTORY_COPY_ES);
  assert.equal(directoryCopy("en"), DIRECTORY_COPY_EN);
  assert.equal(directoryCopy("fr"), DIRECTORY_COPY_EN);
});

test("/es directory chrome reads in Spanish", () => {
  const t = directoryCopy("es");
  assert.equal(t.filters, "Filtros");
  assert.equal(t.next, "Siguiente");
  assert.equal(t.allTalent, "Todo el talento");
  assert.equal(t.profiles(1234), "1,234 perfiles");
  assert.equal(availabilityLine(12, t).text, "Disponible 12 de los próximos 30 días");
  assert.equal(trustTierMeta("gold", t)?.label, "Oro");
});

test("the English chrome is unchanged by default", () => {
  assert.equal(availabilityLine(12).text, availabilityLine(12, DIRECTORY_COPY_EN).text);
  assert.equal(trustTierMeta("verified")?.label, "Verified");
});

test("every directory component reads its chrome from the copy, not literals", () => {
  for (const f of [
    "DirectoryToolbar.tsx",
    "DirectoryFilters.tsx",
    "DirectoryTypeBar.tsx",
    "DirectorySearch.tsx",
    "DirectoryAtoms.tsx",
    "DirectoryTalentRow.tsx",
    "DirectoryTalentCard.tsx",
    "MarketingDirectoryMapClient.tsx",
    "MarketingDirectoryShell.tsx",
  ]) {
    assert.match(dirSrc(f), /useDirectoryCopy\(\)/, `${f} reads the copy`);
  }
  const english = [
    "Updating results",
    "Directory pages",
    "Show more (",
    "Close filters",
    "No profiles match yet",
    "All talent",
    "Clear all",
    "Open in the next 30 days",
    "Quick view",
    "Back to grid",
    "Zoom or drag the map",
  ];
  for (const f of [
    "DirectoryToolbar.tsx",
    "DirectoryFilters.tsx",
    "DirectoryTypeBar.tsx",
    "DirectoryTalentCard.tsx",
    "MarketingDirectoryMapClient.tsx",
    "MarketingDirectoryShell.tsx",
  ]) {
    const src = dirSrc(f);
    for (const s of english) assert.ok(!src.includes(s), `${f} still hardcodes "${s}"`);
  }
  assert.match(
    dirSrc("MarketingDirectoryShell.tsx"),
    /<DirectoryCopyProvider value=\{copy\}>/,
    "the shell provides the locale's copy",
  );
});

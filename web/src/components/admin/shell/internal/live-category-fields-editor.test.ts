import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  NAMESPACE_LABEL,
  NAMESPACE_LABEL_KEY,
  filterLiveCategoryFieldsForScope,
} from "./live-category-fields-editor";

type MiniField = {
  field_key: string;
  field_group_slug: string | null;
  section: string | null;
};

// `section` defaults to "type-specific" (a Services "Details" catch-all
// section) so type-driven fixtures are kept and the existing exclusions
// (skills alias via suppression, creator/media/experience via the general
// namespaces) still hold. Pass a dedicated rail section (e.g. "identity",
// "commercial_terms") to exercise the section gate that fixes the duplication.
function field(
  fieldKey: string,
  group: string | null = null,
  section: string | null = "type-specific",
): MiniField {
  return { field_key: fieldKey, field_group_slug: group, section };
}

test("no-type Details resolves to empty when only legacy/general bleed fields exist", () => {
  const input = [
    field("skills"),
    field("creator.instagram"),
    field("media.website_url"),
    field("experience.years_total"),
  ];
  const result = filterLiveCategoryFieldsForScope(input, "specialty");
  assert.equal(result.length, 0);
});

test("no-type Details never includes legacy Skills & strengths row", () => {
  const input = [field("skills"), field("model.height_cm", "physical-casting")];
  const result = filterLiveCategoryFieldsForScope(input, "specialty");
  assert.equal(result.some((f) => f.field_key === "skills"), false);
});

test("model Details keeps model-specific fields", () => {
  const input = [
    field("model.height_cm", "physical-casting"),
    field("model.waist_cm", "physical-casting"),
    field("skills"),
  ];
  const result = filterLiveCategoryFieldsForScope(input, "specialty");
  const keys = result.map((f) => f.field_key);
  assert.deepEqual(keys, ["model.height_cm", "model.waist_cm"]);
});

test("performer + DJ Details keep relevant performer/music fields", () => {
  const input = [
    field("performer.act_type", "performer-details"),
    field("music.genres", "music-details"),
    field("skills"),
  ];
  const result = filterLiveCategoryFieldsForScope(input, "specialty");
  const keys = result.map((f) => f.field_key);
  assert.deepEqual(keys, ["performer.act_type", "music.genres"]);
});

test("multiple-type union remains without duplicate legacy skills rows", () => {
  const input = [
    field("model.height_cm", "physical-casting"),
    field("music.genres", "music-details"),
    field("skills"),
    field("skills"),
  ];
  const result = filterLiveCategoryFieldsForScope(input, "specialty");
  assert.equal(result.some((f) => f.field_key === "skills"), false);
  assert.equal(result.length, 2);
});

test("creator/media/experience rows do not bleed into generic Details with null group", () => {
  const input = [
    field("creator.followers_count", null),
    field("media.website_url", null),
    field("experience.years_total", null),
    field("host.event_hosting", "host-details"),
  ];
  const result = filterLiveCategoryFieldsForScope(input, "specialty");
  assert.deepEqual(result.map((f) => f.field_key), ["host.event_hosting"]);
});

test("section gate: dedicated-rail-section fields are excluded from Services even when unsuppressed", () => {
  // The duplication fix: these catalog fields are NOT in the suppression lists
  // and are NOT general-namespace, but their `section` has a dedicated rail
  // home, so they must not render as Services "Details" sub-groups.
  const input = [
    field("identity.gender", null, "identity"),
    field("commercial.askForQuote", null, "commercial_terms"),
    field("logistics.driversLicense", null, "logistics"),
    field("event_types", null, "credits"),
    field("model.height_cm", "physical-casting", "type-specific"), // legit catch-all → kept
    field("model.waist_cm", "physical-casting", "measurements"),   // measurements is catch-all → kept
  ];
  const result = filterLiveCategoryFieldsForScope(input, "specialty");
  assert.deepEqual(result.map((f) => f.field_key), ["model.height_cm", "model.waist_cm"]);
});

test("section gate also applies to the General (About) mount: dedicated-section field excluded", () => {
  // A general-namespace field whose section is dedicated must NOT show in the
  // About general block; one in a catch-all section still can.
  const input = [
    field("skills.signature_move", null, "media"),        // dedicated section → excluded
    field("skills.signature_move", null, "type-specific"), // catch-all section → kept
  ];
  const result = filterLiveCategoryFieldsForScope(input, "general");
  assert.deepEqual(result.map((f) => f.section), ["type-specific"]);
});

// Taxonomy expansion: every field_key namespace the two field migrations
// introduce must have a proper label, or the specialty card falls back to a
// title-cased prefix ("Svc", "Biz", "Realestate").
const EXPANSION_MIGRATIONS = [
  "20261231298200_taxonomy_expansion_fields.sql",
  "20261231298300_taxonomy_expansion_regulated_fields.sql",
];

function expansionNamespaces(): string[] {
  const dir = join(__dirname, "..", "..", "..", "..", "..", "..", "supabase", "migrations");
  const found = new Set<string>();
  for (const file of EXPANSION_MIGRATIONS) {
    const sql = readFileSync(join(dir, file), "utf8");
    // A field_key literal is a single-quoted `namespace.name` token.
    for (const m of sql.matchAll(/'([a-z][a-z0-9]*)\.[a-z][a-z0-9_]*'/g)) found.add(m[1]!);
  }
  return [...found].sort();
}

test("every namespace introduced by the taxonomy expansion migrations has a label", () => {
  const namespaces = expansionNamespaces();
  assert.ok(namespaces.length >= 29, `expected the 29 expansion namespaces, found ${namespaces.length}`);
  for (const ns of namespaces) {
    assert.ok(NAMESPACE_LABEL[ns], `NAMESPACE_LABEL has no label for "${ns}"`);
    assert.ok(NAMESPACE_LABEL_KEY[ns], `NAMESPACE_LABEL_KEY has no catalog key for "${ns}"`);
  }
});

test("namespace labels exist in the EN and ES catalogs, with no dash characters", () => {
  const load = (locale: string) =>
    JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "..", "..", "messages", `${locale}.json`), "utf8")) as {
      dashboard: { adminFieldsEditor: { ns: Record<string, string> } };
    };
  const catalogs = { en: load("en").dashboard.adminFieldsEditor.ns, es: load("es").dashboard.adminFieldsEditor.ns };
  for (const ns of expansionNamespaces()) {
    const key = NAMESPACE_LABEL_KEY[ns]!;
    assert.equal(key, `dashboard.adminFieldsEditor.ns.${ns}`, `${ns}: unexpected catalog key`);
    for (const [locale, table] of Object.entries(catalogs)) {
      const label = table[ns];
      assert.ok(label && label.trim(), `${locale} catalog has no label for "${ns}"`);
      assert.ok(!/[\u2013\u2014]/.test(label), `${locale} label for "${ns}" must not contain a dash character`);
    }
    // The English catalog string is the same words as the in-code fallback.
    assert.equal(catalogs.en[ns], NAMESPACE_LABEL[ns], `${ns}: EN catalog and NAMESPACE_LABEL disagree`);
  }
});

// Pins: the writers of public.locations / location_city taxonomy terms never
// fold accents into display names. Incident 2026-09-30: dev seeds upserted
// ASCII "Cancun" over the real "Cancún" (ON CONFLICT DO UPDATE).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const SUPABASE = path.resolve(process.cwd(), "..", "supabase");
const read = (rel: string) => readFileSync(path.join(SUPABASE, rel), "utf8");

describe("location writers preserve accents", () => {
  it("location seeds write Cancún and never overwrite curated names", () => {
    for (const f of ["seed_demo_profiles.sql", "seed_runtime_smoke.sql"]) {
      const sql = read(f);
      assert.ok(sql.includes("'cancun'"), `${f} seeds cancun`);
      const locInsert = sql.slice(sql.indexOf("INSERT INTO public.locations"));
      const stmt = locInsert.slice(0, locInsert.indexOf(";"));
      assert.ok(!stmt.includes("Cancun"), `${f}: no ASCII Cancun name`);
      assert.ok(stmt.includes("Cancún"), `${f}: accented Cancún`);
      assert.match(stmt, /ON CONFLICT \(country_code, city_slug\) DO NOTHING/);
    }
  });

  it("taxonomy imports spell Cancún with the accent", () => {
    assert.match(read("taxonomy_terms_import.sql"), /'cancun', 'Cancún', 'Cancún'/);
    assert.match(read("taxonomy_master_import.json"), /"name_en": "Cancún", "name_es": "Cancún"/);
  });

  it("the restore migration is accent-only, idempotent, and leaves slugs alone", () => {
    const sql = read("migrations/20261231299630_restore_location_accents.sql");
    assert.match(sql, /Cancún/);
    assert.match(sql, /IS DISTINCT FROM/);
    assert.ok(!/\bSET\b((?!\bWHERE\b)[\s\S])*\bcity_slug\s*=/i.test(sql), "must not rewrite slugs");
  });
});

/**
 * TUL-520 — static guard: migrations must not reference columns missing from
 * the latest schema snapshot (database.types.ts).
 *
 * Near-miss: #3179 almost wrote taxonomy_terms.name_en / name_es after those
 * columns were folded into name_i18n.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { test } from "node:test";

import {
  MIGRATIONS_DIR,
  SNAPSHOT_APPLIED_THROUGH,
  TYPES_PATH,
  extractColumnRefs,
  findMissingColumns,
  formatProblems,
  listMigrationFiles,
  loadRepoSchemaSnapshot,
  migrationVersion,
  parseSchemaSnapshot,
  scanMigrations,
} from "./migration-column-guard";

const TAXONOMY_TYPES_FIXTURE = `
  public: {
    Tables: {
      taxonomy_terms: {
        Row: {
          id: string
          kind: string
          name_i18n: Json
          slug: string
        }
        Insert: {
          id?: string
        }
        Update: {
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
    }
    Functions: {
    }
    Enums: {
    }
  }
`;

test("parseSchemaSnapshot reads Row columns from generated types shape", () => {
  const snap = parseSchemaSnapshot(TAXONOMY_TYPES_FIXTURE);
  assert.ok(snap.has("taxonomy_terms"));
  const cols = snap.get("taxonomy_terms")!;
  assert.ok(cols.has("name_i18n"));
  assert.ok(cols.has("slug"));
  assert.equal(cols.has("name_en"), false);
  assert.equal(cols.has("name_es"), false);
});

test("GUARD BITES: UPDATE SET name_en on taxonomy_terms (#3179 near-miss)", () => {
  const snap = parseSchemaSnapshot(TAXONOMY_TYPES_FIXTURE);
  const sql = `
UPDATE public.taxonomy_terms
SET name_en = 'Latin dancer',
    name_es = 'Baile latino'
WHERE slug = 'latin-dancer' AND kind = 'talent_type';
`;
  const problems = findMissingColumns(sql, snap, "bad.sql");
  assert.equal(problems.length, 1);
  assert.deepEqual(problems[0]!.missing, ["name_en", "name_es"]);
  assert.equal(problems[0]!.kind, "update");
  assert.equal(problems[0]!.table, "taxonomy_terms");
});

test("passes when UPDATE writes name_i18n (the #3179 fix shape)", () => {
  const snap = parseSchemaSnapshot(TAXONOMY_TYPES_FIXTURE);
  const sql = `
UPDATE public.taxonomy_terms
SET name_i18n = COALESCE(name_i18n, '{}'::jsonb) || jsonb_build_object('es', 'Baile latino')
WHERE slug = 'latin-dancer' AND kind = 'talent_type';
`;
  assert.deepEqual(findMissingColumns(sql, snap), []);
});

test("GUARD BITES: INSERT column list with dropped columns", () => {
  const snap = parseSchemaSnapshot(TAXONOMY_TYPES_FIXTURE);
  const sql = `
INSERT INTO public.taxonomy_terms (id, kind, slug, name_en, name_es)
VALUES (gen_random_uuid(), 'talent_type', 'latin-dancer', 'Latin dancer', 'Baile latino');
`;
  const problems = findMissingColumns(sql, snap, "insert-bad.sql");
  assert.equal(problems.length, 1);
  assert.deepEqual(problems[0]!.missing, ["name_en", "name_es"]);
  assert.equal(problems[0]!.kind, "insert");
});

test("same-file ADD COLUMN is allowed for subsequent DML", () => {
  const snap = parseSchemaSnapshot(TAXONOMY_TYPES_FIXTURE);
  const sql = `
ALTER TABLE public.taxonomy_terms
  ADD COLUMN IF NOT EXISTS nickname text;
UPDATE public.taxonomy_terms
SET nickname = 'x'
WHERE slug = 'latin-dancer';
`;
  assert.deepEqual(findMissingColumns(sql, snap), []);
});

test("unknown tables (not in snapshot) are skipped, not failed", () => {
  const snap = parseSchemaSnapshot(TAXONOMY_TYPES_FIXTURE);
  const sql = `
INSERT INTO public.brand_new_table (id, foo) VALUES (1, 'x');
`;
  assert.deepEqual(findMissingColumns(sql, snap), []);
});

test("extractColumnRefs ignores SELECT aliases shaped like name_en", () => {
  const refs = extractColumnRefs(`
SELECT (tt.name_i18n ->> 'en') AS name_en FROM public.taxonomy_terms tt;
`);
  assert.deepEqual(refs, []);
});

test("repo schema snapshot loads and includes taxonomy_terms.name_i18n", () => {
  assert.ok(existsSync(TYPES_PATH), `missing ${TYPES_PATH}`);
  const snap = loadRepoSchemaSnapshot();
  assert.ok(snap.size > 50, `expected many tables, got ${snap.size}`);
  const tax = snap.get("taxonomy_terms");
  assert.ok(tax, "taxonomy_terms missing from database.types.ts");
  assert.ok(tax!.has("name_i18n"));
  assert.equal(tax!.has("name_en"), false, "types must not still list folded name_en");
  assert.equal(tax!.has("name_es"), false, "types must not still list folded name_es");
});

test("watermark is at or before the newest migration on disk", () => {
  assert.ok(existsSync(MIGRATIONS_DIR));
  const newest = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => migrationVersion(f))
    .filter((v): v is string => v !== null)
    .sort()
    .at(-1);
  assert.ok(newest, "no migrations found");
  assert.ok(
    SNAPSHOT_APPLIED_THROUGH <= newest,
    `SNAPSHOT_APPLIED_THROUGH (${SNAPSHOT_APPLIED_THROUGH}) is ahead of newest migration ${newest}`,
  );
});

test("migrations newer than the schema snapshot have no missing-column DML", () => {
  const snap = loadRepoSchemaSnapshot();
  const pending = listMigrationFiles(MIGRATIONS_DIR, SNAPSHOT_APPLIED_THROUGH);
  const problems = scanMigrations(MIGRATIONS_DIR, snap, SNAPSHOT_APPLIED_THROUGH);
  assert.deepEqual(
    problems,
    [],
    pending.length === 0 && problems.length === 0
      ? ""
      : `\n\nMigration(s) reference column(s) missing from database.types.ts:\n\n` +
        `${formatProblems(problems)}\n\n` +
        `Either fix the SQL to use columns that exist on the live schema, or\n` +
        `ADD COLUMN in the same migration, or regenerate types + bump\n` +
        `SNAPSHOT_APPLIED_THROUGH after the schema change is applied.\n`,
  );
});

/**
 * TUL-261: the Jor locale migration referenced talent_profiles.secondary_locales
 * before the migration that adds it. Keep the old file guarded. No replacement
 * data migration is added (guard only, no db:push needed).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(fileURLToPath(new URL(".", import.meta.url)), "../../../../supabase/migrations");
const OLD = "20261004015107_jor_locale_es_primary_en_secondary.sql";
const ADD = "20261231299510_talent_profiles_secondary_locales.sql";

test("old jor locale migration is guarded on the column existing", () => {
  const sql = readFileSync(join(DIR, OLD), "utf8");
  assert.match(sql, /DO \$\$/);
  assert.match(sql, /information_schema\.columns/);
  assert.match(sql, /column_name\s*=\s*'secondary_locales'/);
  const guardAt = sql.indexOf("IF EXISTS");
  const updateAt = sql.search(/UPDATE public\.talent_profiles/);
  assert.ok(guardAt >= 0 && updateAt > guardAt, "UPDATE must sit inside the guard");
});

test("column is added after the old migration (why the guard exists)", () => {
  assert.ok(OLD < ADD);
});

test("no replay migration was added for the jor locale data fix", () => {
  const files = readdirSync(DIR).filter((f) => f.includes("jor_locale"));
  assert.deepEqual(files, [OLD]);
});

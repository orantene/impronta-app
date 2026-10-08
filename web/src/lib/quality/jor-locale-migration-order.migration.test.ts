/**
 * TUL-261: the Jor locale migration referenced talent_profiles.secondary_locales
 * before the migration that adds it. Keep the old file guarded and the replay
 * migration sorted after every other file.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(fileURLToPath(new URL(".", import.meta.url)), "../../../../supabase/migrations");
const OLD = "20261004015107_jor_locale_es_primary_en_secondary.sql";
const ADD = "20261231299510_talent_profiles_secondary_locales.sql";
const NEW = "20261231349000_jor_locale_es_primary_en_secondary_replay.sql";

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

test("replay migration sorts after every other migration", () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  assert.equal(files[files.length - 1], NEW);
  const sql = readFileSync(join(DIR, NEW), "utf8");
  assert.match(sql, /profile_code = 'TAL-JORGBEAUTY'/);
  assert.match(sql, /IS DISTINCT FROM/);
});

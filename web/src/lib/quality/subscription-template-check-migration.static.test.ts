/**
 * TUL-1596: production has talent_profiles.subscription_template and
 * talent_profiles_subscription_template_check with no migration creating them (D-014 / D-103).
 * 423500 codifies both, idempotently, with production's exact definition.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repo = join(__dirname, "..", "..", "..", "..");
const name = "20261231423500_talent_profiles_subscription_template_check.sql";
const held = join(repo, "supabase/migrations/_pending_pm", name);
const applied = join(repo, "supabase/migrations", name);

function sql(): string {
  return readFileSync(existsSync(held) ? held : applied, "utf8").replace(/--[^\n]*/g, "");
}

test("423500 adds the column idempotently with production's type, nullability and default", () => {
  assert.match(
    sql(),
    /ALTER\s+TABLE\s+public\.talent_profiles\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+subscription_template\s+text\s+NOT\s+NULL\s+DEFAULT\s+'roster'\s*;/i,
  );
});

test("423500 defines talent_profiles_subscription_template_check only when it is missing", () => {
  const s = sql();
  assert.match(s, /IF\s+NOT\s+EXISTS\s*\([\s\S]*conname\s*=\s*'talent_profiles_subscription_template_check'/i);
  assert.match(s, /ADD\s+CONSTRAINT\s+talent_profiles_subscription_template_check/i);
});

test("the CHECK allows exactly production's six templates", () => {
  const m = sql().match(/CHECK\s*\(\s*subscription_template\s*=\s*ANY\s*\(\s*ARRAY\[([^\]]*)\]/i);
  assert.ok(m, "CHECK on subscription_template = ANY (ARRAY[...]) not found");
  const values = [...m[1].matchAll(/'([a-z]+)'/g)].map((v) => v[1]);
  assert.deepEqual(values, ["roster", "editorial", "studio", "stage", "creator", "epk"]);
});

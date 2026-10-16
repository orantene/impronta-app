/** Static assertions: the legacy-hub-hostname migration only touches that hostname. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(fileURLToPath(new URL(".", import.meta.url)), "../../../../supabase/migrations");
const FILE = "20261231400800_deactivate_legacy_hub_hostname.sql";
const CODE = readFileSync(join(DIR, FILE), "utf8").replace(/--.*$/gm, "");

test("single UPDATE scoped to pitiriasisversicolor.com, nothing else", () => {
  const stmts = CODE.split(";").map((s) => s.trim()).filter(Boolean);
  assert.equal(stmts.length, 1);
  assert.match(stmts[0], /^update public\.agency_domains/i);
  assert.match(stmts[0], /where hostname = 'pitiriasisversicolor\.com'/i);
  assert.match(stmts[0], /status = 'suspended'/);
  assert.doesNotMatch(CODE, /\b(delete|insert|drop|alter|truncate)\b/i);
});

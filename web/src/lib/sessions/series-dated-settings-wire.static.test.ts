import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const src = readFileSync(join(fileURLToPath(new URL(".", import.meta.url)), "../server-actions/series-dated-settings.ts"), "utf8");

test("no raw .from() in a server action (lint ratchet): every query goes through tenantScopedQuery", () => {
  assert.doesNotMatch(src, /\.from\(/);
  assert.equal((src.match(/tenantScopedQuery\(g\.admin,/g) ?? []).length, 4);
});

test("a failed read of the held columns is not an empty form (saving it would wipe the settings)", () => {
  assert.match(src, /extraErr\.code !== "42703"/);
  assert.match(src, /series\.datedSettings\.columns/);
});

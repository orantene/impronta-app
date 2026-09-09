import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "./guest-client.ts"),
  "utf8",
);

test("ensureGuestClientByEmail no longer mints auth users for new emails", () => {
  assert.doesNotMatch(SRC, /auth\.admin\.createUser/);
  assert.match(SRC, /do NOT mint an auth\.users row/);
});

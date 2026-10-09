/**
 * Static assertions over `20261231350656_client_auth_events_apple.sql`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../../../../supabase/migrations",
);

const appleFiles = readdirSync(migrationsDir).filter((f) =>
  f.endsWith("_client_auth_events_apple.sql"),
);

test("exactly one Apple client_auth_events migration; version after cancel_booking", () => {
  assert.equal(appleFiles.length, 1);
  const name = appleFiles[0]!;
  const version = name.split("_")[0]!;
  assert.ok(version > "20261231349151", `got ${version}`);
  assert.notEqual(version, "20261231349000", "349000 is taken by #2781 on production");
});

const MIGRATION = readFileSync(join(migrationsDir, appleFiles[0]!), "utf8");

test("widens client_auth_events.method CHECK to include apple", () => {
  assert.match(MIGRATION, /DROP CONSTRAINT IF EXISTS client_auth_events_method_check/);
  assert.match(
    MIGRATION,
    /method IN \('email_code', 'google', 'password', 'sso', 'apple'\)/,
  );
});

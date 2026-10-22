/**
 * Pins the safety shape of the Diego staging seed: staging-only guard, dry-run default,
 * no deletes, no password logging. Reads the source; opens no database connection.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, "seed-diego-personas.mjs");
const src = readFileSync(file, "utf8");
const code = src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, "");

test("fxlank guard: staging ref required, pluhda refused by name", async () => {
  assert.match(src, /fxlankepwnvelxjrahwk/);
  assert.match(code, /includes\(PROD_MARKER\)/);
  assert.match(code, /!u\.includes\(STAGING_REF\)/);
  const run = (url) =>
    spawnSync(process.execPath, [file], { env: { PATH: process.env.PATH, NEXT_PUBLIC_SUPABASE_URL: url }, encoding: "utf8" });
  assert.equal(run("https://pluhdapdnuiulvxmyspd.supabase.co").status, 1);
  assert.equal(run("https://someotherref.supabase.co").status, 1);
  assert.equal(run("").status, 1);
});

test("dry-run is the default and writes nothing", () => {
  const r = spawnSync(process.execPath, [file], {
    env: { PATH: process.env.PATH, NEXT_PUBLIC_SUPABASE_URL: "https://fxlankepwnvelxjrahwk.supabase.co" },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /mode=dry-run/);
  assert.match(r.stdout, /no network call made/);
  assert.match(code, /const apply = args\.includes\("--apply"\)/);
  assert.match(code, /--apply requires --creds-file/);
});

test("never deletes", () => {
  assert.doesNotMatch(code, /\.delete\s*\(/);
  assert.doesNotMatch(code, /deleteUser/);
  assert.doesNotMatch(code, /\bDELETE\b/i);
  assert.doesNotMatch(code, /\.rpc\s*\(/);
});

test("never logs a password; creds file is mode 600", () => {
  // The only place a password is used: createUser + the creds-file append.
  const uses = code.split("\n").filter((l) => /\bpassword\b/.test(l) && /console\./.test(l));
  assert.deepEqual(uses, []);
  assert.match(code, /appendFileSync\(credsFile,[^\n]*mode: 0o600/);
  assert.match(code, /chmodSync\(credsFile, 0o600\)/);
  assert.match(code, /email_confirm: true/);
  assert.match(code, /randomBytes\(24\)/);
});

test("never touches the protected talents", () => {
  assert.match(src, /TAL-93938/);
  assert.match(src, /TAL-93940/);
  const codes = [...src.matchAll(/code: "(TAL-\d+)"/g)].map((m) => m[1]);
  assert.ok(codes.length >= 3);
  assert.ok(!codes.includes("TAL-93938") && !codes.includes("TAL-93940"));
});

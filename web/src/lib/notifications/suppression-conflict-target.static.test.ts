import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The writer must name a conflict target Postgres can actually infer.
//
// `applyResendEvent` used to choose one at runtime:
//
//   onConflict: userId ? "user_id,email_address" : "email_address"
//
// Probed against production through the same client the app uses:
//   user branch   -> a post-planning error. It plans.
//   guest branch  -> 42P10. It has NEVER planned, so no bounce for a guest or
//                    an invitee has ever been suppressed, and the dead address
//                    kept being mailed.
//
// The guest index was `UNIQUE (lower(email_address)) WHERE user_id IS NULL` —
// an expression index AND partial, two independent reasons ON CONFLICT cannot
// infer it from a bare column name. PostgREST cannot send an expression or a
// predicate, so no target spelled in the client could have matched it.
//
// A runtime-computed conflict target is a branch only half of production ever
// exercises, which is why this survived three passes over the same code.

const ROOT = process.cwd();
const WRITER = readFileSync(
  join(ROOT, "src", "lib", "notifications", "resend-webhook.ts"),
  "utf8",
);

/** Source with comments stripped: prose about the bug must not satisfy a guard. */
const CODE = WRITER.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the suppression conflict target is a constant, not chosen at runtime", () => {
  const upsert = CODE.slice(CODE.indexOf('.from("email_suppressions")'));
  assert.ok(upsert.length > 0, "the suppression upsert has moved or gone");
  const target = upsert.match(/onConflict:\s*([^,\n]+)/);
  assert.ok(target, "no onConflict on the suppression upsert");
  assert.doesNotMatch(
    target[1],
    /\?|:/,
    `conflict target is computed at runtime (${target[1].trim()}); only the branch with a matching index would ever plan`,
  );
});

test("it targets the inferrable generated columns", () => {
  assert.match(
    CODE,
    /onConflict:\s*"user_key,email_key"/,
    "conflict target is not (user_key, email_key)",
  );
  assert.doesNotMatch(
    CODE,
    /onConflict:\s*"email_address"/,
    "still targets a bare email_address, which no inferrable index serves",
  );
});

test("a migration defines those columns and the index that makes them inferrable", () => {
  // The writer naming columns that do not exist would fail the same way, just
  // later, so the guard checks the schema side is present too.
  const dir = join(ROOT, "..", "supabase", "migrations");
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
  assert.match(sql, /add column if not exists user_key/, "user_key is never created");
  assert.match(sql, /add column if not exists email_key/, "email_key is never created");
  assert.match(
    sql,
    /create unique index email_suppressions_uq[\s\S]{0,120}\(user_key,\s*email_key\)/,
    "no total, non-expression unique index on (user_key, email_key)",
  );
});

test("the replacement index is not partial and not an expression", () => {
  // Either property alone makes ON CONFLICT unable to infer it. This is the
  // third table in this codebase to be bitten by exactly that.
  const dir = join(ROOT, "..", "supabase", "migrations");
  const mine = readdirSync(dir).find((f) => f.includes("email_suppressions_inferrable_conflict"));
  assert.ok(mine, "the migration is missing");
  const sql = readFileSync(join(dir, mine), "utf8");
  const create = sql.slice(sql.indexOf("create unique index email_suppressions_uq"));
  const stmt = create.slice(0, create.indexOf(";"));
  assert.doesNotMatch(stmt, /\bwhere\b/i, "the new index is partial again");
  assert.doesNotMatch(stmt, /lower\s*\(/i, "the new index is an expression index again");
});

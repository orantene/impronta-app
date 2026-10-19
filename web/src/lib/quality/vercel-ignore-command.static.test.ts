import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const cfg = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
  ignoreCommand?: string;
};
const cmd = cfg.ignoreCommand ?? "";

test("ignoreCommand builds the production branch", () => {
  assert.match(cmd, /\[ "\$VERCEL_GIT_COMMIT_REF" != "production" \]/);
});

// Oct 15: main no longer builds on push (every main merge was a paid build).
// Only the `production` release pointer builds; staging is refreshed on purpose.
test("ignoreCommand does NOT build main on push (cost rule, Oct 15)", () => {
  assert.ok(!cmd.includes('"main"'));
});

test("ignoreCommand no longer builds the retired program/journeys-2026-09 branch", () => {
  assert.ok(!cmd.includes("program/journeys-2026-09"));
});

test("ignoreCommand never keys on VERCEL_ENV (unset during the ignore step)", () => {
  assert.ok(!cmd.includes("VERCEL_ENV"));
});

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

test("ignoreCommand builds the main staging branch (staging deploys from main since 2026-10-14)", () => {
  assert.match(cmd, /\[ "\$VERCEL_GIT_COMMIT_REF" != "main" \]/);
});

test("ignoreCommand no longer builds the retired program/journeys-2026-09 branch", () => {
  assert.ok(!cmd.includes("program/journeys-2026-09"));
});

test("ignoreCommand never keys on VERCEL_ENV (unset during the ignore step)", () => {
  assert.ok(!cmd.includes("VERCEL_ENV"));
});

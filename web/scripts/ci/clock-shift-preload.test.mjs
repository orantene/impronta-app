import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const PRELOAD = join(dirname(fileURLToPath(import.meta.url)), "clock-shift-preload.cjs");
const DAY = 24 * 60 * 60 * 1000;

function run(script, days) {
  const r = spawnSync(process.execPath, ["--require", PRELOAD, "-e", script], {
    env: { ...process.env, CLOCK_SHIFT_DAYS: String(days) },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test("new Date() and Date.now() move forward by CLOCK_SHIFT_DAYS", () => {
  const before = Date.now();
  const r = run("console.log(JSON.stringify({ a: Date.now(), b: new Date().getTime() }))", 90);
  assert.ok(r.a - before >= 90 * DAY && r.a - before < 90 * DAY + 60_000);
  assert.ok(r.b - before >= 90 * DAY && r.b - before < 90 * DAY + 60_000);
});

test("explicit dates are untouched, so a test that pins its clock behaves the same", () => {
  const r = run(
    'console.log(JSON.stringify({ iso: new Date("2026-10-09T15:00:00Z").toISOString(), utc: Date.UTC(2026, 9, 9), parsed: Date.parse("2026-10-09T15:00:00Z"), inst: new Date(5) instanceof Date }))',
    90,
  );
  assert.equal(r.iso, "2026-10-09T15:00:00.000Z");
  assert.equal(r.utc, Date.UTC(2026, 9, 9));
  assert.equal(r.parsed, Date.parse("2026-10-09T15:00:00Z"));
  assert.equal(r.inst, true);
});

test("CLOCK_SHIFT_DAYS=0 is a no-op", () => {
  const before = Date.now();
  const r = run("console.log(JSON.stringify({ a: Date.now() }))", 0);
  assert.ok(Math.abs(r.a - before) < 60_000);
});

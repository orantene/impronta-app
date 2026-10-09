/**
 * scheduling-frozen-clock.static.test.ts pins the date-rot fix: the
 * test:scheduling lane runs with scripts/frozen-clock-test.cjs, so a slot or
 * booking test that forgets to pass `now` cannot read the real clock and start
 * failing as the calendar moves past its fixtures (batch #3036, 2026-10-09).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const WEB = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(WEB, "package.json"), "utf8")) as { scripts: Record<string, string> };
const hookSrc = readFileSync(path.join(WEB, "scripts/frozen-clock-test.cjs"), "utf8");
// Code only: the header comment legitimately names setTimeout/performance.now.
const hook = hookSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("test:scheduling loads the frozen clock", () => {
  assert.match(pkg.scripts["test:scheduling"], /--require \.\/scripts\/frozen-clock-test\.cjs/);
});

test("the hook freezes Date.now and argument-less new Date, and nothing else", () => {
  assert.match(hook, /static now\(\)\s*\{\s*return FROZEN_MS;/);
  assert.match(hook, /if \(args\.length === 0\) super\(FROZEN_MS\)/);
  assert.doesNotMatch(hook, /setTimeout|setInterval|performance/);
});

test("the frozen instant matches the scheduling fixtures (2026-10-08T12:00Z)", () => {
  assert.match(hook, /"2026-10-08T12:00:00\.000Z"/);
});

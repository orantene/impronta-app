import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The desk header says "N open" from status = 'open'. The nav badge used to add
 * `waiting_on = support`, so the same desk read 22 in one place and 21 in the
 * other. Both must count the same set of tickets.
 */
test("nav badge counts every open ticket, like the desk header", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/support/load-hq.ts"), "utf8");
  const start = src.indexOf("export async function loadHqSupportOpenCount");
  const end = src.indexOf("export async function loadHqSupportQueue");
  assert.ok(start > 0 && end > start);
  const body = src.slice(start, end);
  assert.match(body, /\.eq\("status", "open"\)/);
  assert.doesNotMatch(body, /waiting_on/);
});

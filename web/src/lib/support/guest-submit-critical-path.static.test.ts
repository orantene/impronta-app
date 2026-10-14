import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TUL-602 slow1: work the visitor never sees must not hold the submit.
const dir = join(process.cwd(), "src", "lib", "support");
const actions = readFileSync(join(dir, "guest-actions.ts"), "utf8");
const guard = readFileSync(join(dir, "guest-support-abuse-guard.ts"), "utf8");
const emit = readFileSync(join(dir, "support-engine-emit.ts"), "utf8");

test("email and notification dispatch run via after()", () => {
  assert.match(emit, /after\(run\)/);
  assert.doesNotMatch(emit, /await dispatchEventNotifications/);
});

test("lead stamping runs via after(), never awaited in an action", () => {
  assert.match(actions, /after\(run\)/);
  assert.doesNotMatch(actions, /await stampLeadId\(/);
  assert.equal((actions.match(/stampLeadIdAfterResponse\(/g) ?? []).length, 4); // def + 3 calls
});

test("create-abuse rate limits run in parallel", () => {
  const start = guard.indexOf("export async function checkGuestSupportCreateAbuse");
  const end = guard.indexOf("export async function checkGuestSupportMessageAbuse");
  const body = guard.slice(start, end);
  assert.match(body, /Promise\.all\(/);
  assert.doesNotMatch(body, /await checkSupportGuestCreateBy/);
});

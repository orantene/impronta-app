import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// TUL-625: the inbox id scans and the hub lookup must not run one after another.
const actor = readFileSync("src/lib/messaging/talent-actor.ts", "utf8");
const rows = readFileSync("src/lib/messaging/talent-inbox-rows.ts", "utf8");

test("listTalentInquiryIds runs the participants scan and both contains scans together", () => {
  const fn = actor.slice(actor.indexOf("export async function listTalentInquiryIds"));
  const all = fn.indexOf("Promise.all([");
  assert.ok(all > 0);
  assert.ok(fn.indexOf('.from("inquiry_participants")') > all, "participants read is inside the Promise.all");
  assert.equal((fn.match(/\.limit\(TALENT_INBOX_SCAN_LIMIT\)/g) ?? []).length, 3, "all three scans stay capped");
});

test("the hub lookup starts before the id scan, not after the inbox read", () => {
  const fn = rows.slice(rows.indexOf("export async function loadTalentInboxForActor"));
  assert.ok(fn.indexOf("getPlatformHubTenant()") < fn.indexOf("listTalentInquiryIds("));
  assert.doesNotMatch(fn, /await getPlatformHubTenant\(\)/);
});

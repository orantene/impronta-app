/**
 * Static contract: shared-draft writer must authorize inquiry managers
 * (staff OR active coordinator), not workspace-staff alone — talent inbox
 * Continue → offer is blocked otherwise (`not_allowed`).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const engine = readFileSync(join(dir, "messaging-engine.ts"), "utf8");
const guard = readFileSync(join(dir, "../messaging/staff-guard.ts"), "utf8");

test("messagingEnsureSharedDraft gates via messagingInquiryManager", () => {
  const fn = engine.slice(engine.indexOf("export async function messagingEnsureSharedDraft"));
  const end = fn.indexOf("export async function messagingRequestPayment");
  const body = end >= 0 ? fn.slice(0, end) : fn;
  assert.match(body, /messagingInquiryManager\(parsed\.data\.inquiryId\)/);
  assert.match(guard, /requireInquiryManagerAction\(inquiryId\)/);
  assert.match(guard, /return messagingStaff\(\)/);
  const mgrIdx = guard.indexOf("requireInquiryManagerAction(inquiryId)");
  const staffIdx = guard.indexOf("return messagingStaff()");
  assert.ok(mgrIdx >= 0 && staffIdx > mgrIdx, "manager gate before staff fallback");
});

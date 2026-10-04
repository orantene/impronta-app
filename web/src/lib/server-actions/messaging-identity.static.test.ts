/**
 * Static contract: identity capture / match / create-client must authorize
 * inquiry managers (staff OR active coordinator). Talent inbox Capture
 * identity Save otherwise returns `not_allowed` ("You cannot do that from here.").
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const identity = readFileSync(join(dir, "messaging-identity.ts"), "utf8");
const start = readFileSync(join(dir, "messaging-start.ts"), "utf8");
const talentEngine = readFileSync(
  join(dir, "../../components/messages-v5/shell/talent-engine.ts"),
  "utf8",
);

function sliceExport(src: string, name: string, nextNames: string[]) {
  const startIdx = src.indexOf(`export async function ${name}`);
  assert.ok(startIdx >= 0, `missing ${name}`);
  let end = src.length;
  for (const n of nextNames) {
    const i = src.indexOf(`export async function ${n}`, startIdx + 1);
    if (i >= 0 && i < end) end = i;
  }
  return src.slice(startIdx, end);
}

test("messagingMatchCustomers gates via messagingInquiryManager(inquiryId)", () => {
  const body = sliceExport(identity, "messagingMatchCustomers", ["messagingCaptureIdentity"]);
  assert.match(body, /inquiryId: string/);
  assert.match(body, /messagingInquiryManager\(parsed\.data\.inquiryId\)/);
  assert.doesNotMatch(body, /const g = await staff\(\)/);
});

test("messagingCaptureIdentity gates via messagingInquiryManager(inquiryId)", () => {
  const body = sliceExport(identity, "messagingCaptureIdentity", []);
  assert.match(body, /messagingInquiryManager\(parsed\.data\.inquiryId\)/);
  assert.doesNotMatch(body, /const g = await staff\(\)/);
});

test("messagingCreateClientForThread gates via messagingInquiryManager(inquiryId)", () => {
  const body = sliceExport(start, "messagingCreateClientForThread", []);
  assert.match(body, /messagingInquiryManager\(parsed\.data\.inquiryId\)/);
  assert.doesNotMatch(body, /const g = await staff\(\)/);
});

test("talentShellEngine wires real identity actions (not stubbed not_allowed)", () => {
  assert.match(talentEngine, /identity:\s*engineIdentityActions/);
  assert.doesNotMatch(talentEngine, /createClient:\s*async\s*\(\)\s*=>\s*\(\{\s*ok:\s*false,\s*reason:\s*"not_allowed"/);
});

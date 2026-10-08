/**
 * Static contract: identity capture / match / create-client must authorize
 * inquiry managers (staff OR active coordinator), then the hub talent seller
 * (same fallback as messagingRequestPayment). Manager-only refused Soft Gel
 * dock Capture identity Save with `not_allowed`.
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

function assertSellerFallbackGate(body: string) {
  assert.match(body, /messagingInquiryManager\(parsed\.data\.inquiryId\)/);
  assert.match(body, /talentSellerPaymentActor\(parsed\.data\.inquiryId\)/);
  assert.doesNotMatch(body, /const g = await staff\(\)/);
}

test("messagingMatchCustomers gates via manager then talent seller", () => {
  const body = sliceExport(identity, "messagingMatchCustomers", ["messagingCaptureIdentity"]);
  assert.match(body, /inquiryId: string/);
  assertSellerFallbackGate(body);
  assert.match(body, /if \(gated\.ok\)/);
  // Hub sellers share tenant_id — service-role match must stay in her pool.
  assert.match(body, /ownerTalentProfileId = seller\.talentProfileId/);
  assert.match(body, /\.eq\("owner_talent_profile_id", ownerTalentProfileId\)/);
});

test("messagingCaptureIdentity gates via manager then talent seller", () => {
  const body = sliceExport(identity, "messagingCaptureIdentity", []);
  assertSellerFallbackGate(body);
});

test("messagingCreateClientForThread gates via manager then talent seller", () => {
  const body = sliceExport(start, "messagingCreateClientForThread", []);
  assertSellerFallbackGate(body);
  assert.match(body, /if \(gated\.ok\)/);
  // Seller create → talent-owned pool; managers keep null ownership.
  assert.match(body, /ownerTalentProfileId = seller\.talentProfileId/);
  assert.match(body, /ownerTalentProfileId,/);
  assert.match(body, /ensureCustomer\(/);
});

test("talentShellEngine wires real identity actions (not stubbed not_allowed)", () => {
  assert.match(talentEngine, /identity:\s*engineIdentityActions/);
  assert.doesNotMatch(talentEngine, /createClient:\s*async\s*\(\)\s*=>\s*\(\{\s*ok:\s*false,\s*reason:\s*"not_allowed"/);
});

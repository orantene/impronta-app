/**
 * TUL-668: /talent/money fee estimate hung 11s+ on a cold visit.
 * Root cause: two server actions per mount (queued one at a time by Next), each
 * repeating the heavy talent-self guard, then RPC and floor read back to back,
 * and a failed read left the card on "Loading" forever. Pins the fix without
 * touching any fee math.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("fee card mount makes ONE server action call, not two queued ones", () => {
  const card = read("components/talent/money/FeePayerCard.tsx");
  assert.match(card, /getFeeCardInit\(currency\)/);
  assert.doesNotMatch(card, /getFeePreviewConfig|getFeePayer\b/);
});

test("fee card gives up with an unavailable state and a retry", () => {
  const card = read("components/talent/money/FeePayerCard.tsx");
  assert.match(card, /FEE_ESTIMATE_TIMEOUT_MS/);
  assert.match(card, /"unavailable"/);
  assert.match(card, /data-testid="fee-payer-retry"/);
  const es = read("components/admin/shell/internal/dashboard-i18n-fees.ts");
  assert.match(es, /"Fee estimate unavailable right now\."/);
});

test("server reads run in parallel: no sequential await of guard, RPC and floor", () => {
  const src = read("lib/billing/fee-payer-actions.ts");
  const init = src.slice(src.indexOf("export async function getFeeCardInit"), src.indexOf("export async function getFeePayer"));
  assert.equal((init.match(/requireTalentSelf\(/g) ?? []).length, 1, "one guard per card load");
  assert.match(init, /Promise\.all\(\[\s*getProcessingFeePayer/);
  const cfg = src.slice(src.indexOf("export async function getFeePreviewConfig"), src.indexOf("export async function getFeeCardInit"));
  assert.match(cfg, /Promise\.all\(\[requireTalentSelf\(\), readPreviewInputs\(admin\)\]\)/);
  const inputs = src.slice(src.indexOf("async function readPreviewInputs"), src.indexOf("export async function getFeePreviewConfig"));
  assert.match(inputs, /Promise\.all\(\[\s*readPlatformProcessingMode/);
});

test("money math is untouched: still the same preview builder with the same inputs", () => {
  const src = read("lib/billing/fee-payer-actions.ts");
  assert.equal((src.match(/feePreviewConfigFromProcessingModeRow\(inputs\.row, currency, inputs\.takeFloorCents\)/g) ?? []).length, 2);
  const card = read("components/talent/money/FeePayerCard.tsx");
  assert.match(card, /takeBps: platformConfig\.takeBps/);
  assert.match(card, /takeFloorCents: platformConfig\.takeFloorCents/);
});

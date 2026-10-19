import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(
  join(fileURLToPath(new URL(".", import.meta.url)), "../../app/(public)/_dated/dated-purchase-actions.ts"),
  "utf8",
);

test("the dated purchase action is a guarded server action", () => {
  assert.match(src, /^"use server";/);
  assert.match(src, /await requireNotImpersonating\(\)/);
  assert.match(src, /import "server-only"/);
});

test("every read is tenant scoped and the sale goes through the one engine", () => {
  assert.match(src, /createPurchase\(admin, purchase\)/);
  assert.match(src, /buildDatedPurchase\(/);
  const reads = src.match(/\.from\("(?:talent_offerings|sessions|session_series|capacity_pools)"\)[\s\S]{0,400}?maybeSingle\(\)|\.from\("capacity_pools"\)[\s\S]{0,400}?\.in\("pool_key"/g) ?? [];
  assert.ok(reads.length >= 4);
  for (const r of reads) assert.match(r, /\.eq\("tenant_id", d\.tenantId\)/, r.slice(0, 80));
});

test("sales stop and the private-date flag are enforced, and fail closed", () => {
  assert.match(src, /salesState\(/);
  assert.match(src, /sales_closed/);
  assert.match(src, /private_on_request/);
  // a missing held column must not break the sale
  assert.match(src, /if \(!closeErr\)/);
});

test("no clamping of quantities and no raw price from the client", () => {
  assert.doesNotMatch(src, /Math\.min\(\s*d\.legs|clamp/i);
  assert.doesNotMatch(src, /amountCents:\s*d\./);
});

test("ticketEmailed is true only when delivery really succeeded", () => {
  assert.match(src, /ticketEmailed = delivered\.ok === true/);
  assert.match(src, /let ticketEmailed = false/);
});

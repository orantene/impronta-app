import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
const actions = readFileSync(join(root, "app/(public)/_dated/dated-picker-actions.ts"), "utf8");
const step = readFileSync(join(root, "components/public-booking/DatedPlacesStep.tsx"), "utf8");

test("every picker read is tenant scoped", () => {
  const reads = actions.match(/\.from\("(?:talent_offerings|sessions|session_series|capacity_pools|orders)"\)[\s\S]{0,420}?(?:maybeSingle\(\)|\.order\()/g) ?? [];
  assert.ok(reads.length >= 5);
  for (const r of reads) assert.match(r, /\.eq\("tenant_id", (?:tenantId|d\.tenantId)\)/, r.slice(0, 90));
});

test("card hop and waitlist are guarded actions; cancel url is a same-site path", () => {
  assert.match(actions, /^"use server";/);
  assert.equal((actions.match(/await requireNotImpersonating\(\)/g) ?? []).length, 2);
  assert.match(actions, /safeReturnPath\(d\.returnPath\)/);
});

test("the step never claims an email unless the server said so, and has no hard purchase import", () => {
  assert.match(step, /res\.ticketEmailed \? c\.confirmed : c\.confirmedNoEmail/);
  assert.doesNotMatch(step, /dated-purchase-actions/);
});

test("the step uses the picker copy, not literals", () => {
  assert.doesNotMatch(step, />\s*(Pick a date|Elige una fecha|Pay and book)\s*</);
});

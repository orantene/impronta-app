import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const src = readFileSync(join(process.cwd(), "src/lib/directory/price-from.ts"), "utf8");

// TUL-791: on the platform/hub host (tenantId null) the card must read the
// same offerings the profile reads, or it says only "Consultar" while the
// profile says "Desde $500". On an agency host the tenant filter stays.
test("TUL-791: both price readers apply the tenant filter only when a tenant is in scope", () => {
  const filters = src.match(/if \(tenantId\) query = query\.eq\("tenant_id", tenantId\);/g) ?? [];
  assert.equal(filters.length, 2);
  assert.doesNotMatch(src, /talentProfileIds\.length === 0 \|\| !tenantId/);
});

test("TUL-791: an agency scope is never dropped (tenant isolation)", () => {
  assert.match(src, /TENANT ISOLATION/);
  assert.match(src, /tenant filter is therefore mandatory/);
});

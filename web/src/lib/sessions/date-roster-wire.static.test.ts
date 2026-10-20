import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const src = readFileSync(join(here, "date-roster-actions.ts"), "utf8");

test("the roster read is staff-guarded and tenant scoped on every table it owns", () => {
  assert.match(src, /^"use server";/);
  assert.match(src, /requireWorkspaceStaffAction\(\)/);
  assert.match(src, /staff\.tenantId !== tenantId/);
  const reads = src.match(/\.from\("(?:sessions|admissions)"\)[\s\S]{0,260}?(?:maybeSingle\(\)|\.order\()/g) ?? [];
  assert.equal(reads.length, 2);
  for (const r of reads) assert.match(r, /\.eq\("tenant_id", tenantId\)/);
});
